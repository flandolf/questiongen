use crate::models::{AppError, CommandResult};
use bytes::Bytes;
use futures_util::stream::Stream;
use http_body_util::{BodyExt, BodyStream};
use hyper::body::Incoming;
use hyper::header::{AUTHORIZATION, CONTENT_TYPE};
use hyper::{Request, StatusCode};
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use serde::de::DeserializeOwned;
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use std::time::Duration;

type HttpsClient = Client<hyper_rustls::HttpsConnector<HttpConnector>, String>;

fn http_client() -> &'static HttpsClient {
    static CLIENT: OnceLock<HttpsClient> = OnceLock::new();
    CLIENT.get_or_init(build_http_client)
}

fn build_http_client() -> HttpsClient {
    let connector = hyper_rustls::HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_or_http()
        .enable_http1()
        .build();

    Client::builder(TokioExecutor::new())
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(4)
        .build(connector)
}

pub struct HttpClientResponse {
    status: StatusCode,
    body: Incoming,
}

impl HttpClientResponse {
    pub fn status(&self) -> StatusCode {
        self.status
    }

    pub fn is_success(&self) -> bool {
        self.status.is_success()
    }

    pub async fn json<T: DeserializeOwned>(self) -> CommandResult<T> {
        let body_bytes = self.bytes().await?;
        serde_json::from_slice(&body_bytes)
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid JSON response: {e}")))
    }

    pub async fn text(self) -> CommandResult<String> {
        let body_bytes = self.bytes().await?;
        String::from_utf8(body_bytes.to_vec())
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid UTF-8 response: {e}")))
    }

    pub async fn bytes(self) -> CommandResult<Bytes> {
        BodyExt::collect(self.body)
            .await
            .map(|b| b.to_bytes())
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to read body: {e}")))
    }

    pub fn byte_stream(self) -> AppByteStream {
        AppByteStream {
            inner: BodyStream::new(self.body),
        }
    }
}

pub struct AppByteStream {
    inner: BodyStream<Incoming>,
}

impl Stream for AppByteStream {
    type Item = Result<Bytes, AppError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            match Pin::new(&mut self.inner).poll_next(cx) {
                Poll::Ready(Some(Ok(frame))) => match frame.into_data() {
                    Ok(data) if !data.is_empty() => {
                        return Poll::Ready(Some(Ok(data)));
                    }
                    _ => continue,
                },
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(Err(AppError::new(
                        "NETWORK_ERROR",
                        format!("Stream error: {e}"),
                    ))));
                }
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

pub async fn post_json(
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> CommandResult<HttpClientResponse> {
    let body_string = serde_json::to_string(body)
        .map_err(|e| AppError::new("SERIALIZE_ERROR", format!("Body serialization failed: {e}")))?;

    let req = Request::builder()
        .method("POST")
        .uri(url)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .body(body_string)
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to build request: {e}")))?;

    send_request(req).await
}

pub async fn get_json(url: &str, api_key: &str) -> CommandResult<HttpClientResponse> {
    let req = Request::builder()
        .method("GET")
        .uri(url)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .body(String::new())
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to build request: {e}")))?;

    send_request(req).await
}

pub async fn send_request(req: Request<String>) -> CommandResult<HttpClientResponse> {
    let resp = http_client().request(req).await.map_err(|e| {
        let msg = format!("Request failed: {e}");
        if msg.to_lowercase().contains("timeout") || msg.to_lowercase().contains("timed out") {
            AppError::new("TIMEOUT_ERROR", msg)
        } else {
            AppError::new("NETWORK_ERROR", msg)
        }
    })?;

    Ok(HttpClientResponse {
        status: resp.status(),
        body: resp.into_body(),
    })
}
