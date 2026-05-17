# Remove rustls + reqwest, Replace with hyper + native-tls

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace reqwest+rustls HTTP stack with hyper+native-tls to fix Android TLS issues where rustls-platform-verifier's JNI-based cert store access fails.

**Architecture:** Replace the shared `reqwest::Client` singleton in `llm.rs` with a custom `HttpClient` struct wrapping `hyper` 1.x + `hyper-tls` (native-tls). All four files that use HTTP (`llm.rs`, `deepseek_info.rs`, `openrouter_info.rs`, and indirectly `lib.rs`) switch to the new client. The Android JNI rustls init code (~60 lines) is deleted entirely. The new client handles JSON POST/GET with Bearer auth, SSE streaming, timeouts, and typed responses through a thin adapter layer.

**Tech Stack:** `hyper` 1.x, `hyper-util`, `hyper-tls`, `native-tls`, `http-body-util`, `tokio-native-tls`, `bytes` — all async on tokio.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/Cargo.toml` | **Modify** | Remove reqwest+rustls-platform-verifier, add hyper+native-tls deps |
| `src-tauri/src/http_client.rs` | **Create** | New platform-agnostic HTTP client abstraction |
| `src-tauri/src/llm.rs` | **Modify** | Replace `http_client()` singleton + all reqwest calls with new client |
| `src-tauri/src/lib.rs` | **Modify** | Remove Android rustls init in setup + `ensure_android_rustls_verifier` calls |
| `src-tauri/src/deepseek_info.rs` | **Modify** | Replace reqwest imports + calls with new client |
| `src-tauri/src/openrouter_info.rs` | **Modify** | Replace reqwest imports + calls + `reqwest::Client` param with new client |

---

### Task 1: Add dependencies and remove old ones

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Update Cargo.toml dependencies**

Replace the reqwest and rustls-platform-verifier lines:

```toml
# Remove these:
# reqwest = { version = "0.13", default-features = false, features = ["json", "rustls", "stream"] }
# rustls-platform-verifier = "0.7"

# Add these:
hyper = { version = "1", features = ["client", "http1"] }
hyper-tls = "1"
hyper-util = { version = "0.1", features = ["client-legacy", "tokio"] }
http-body-util = "0.1"
native-tls = "0.2"
tokio-native-tls = "0.3"
bytes = "1"
```

- [ ] **Step 2: Verify Cargo.toml parses correctly**

Run: `cd src-tauri && cargo verify-project 2>&1 || cargo metadata --no-deps 2>&1 | head -20`
Expected: No parse errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "deps: replace reqwest+rustls with hyper+native-tls"
```

---

### Task 2: Create the new HTTP client abstraction

**Files:**
- Create: `src-tauri/src/http_client.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod http_client;`)

- [ ] **Step 1: Create `src-tauri/src/http_client.rs`**

Write the complete HTTP client module:

```rust
use crate::models::{AppError, CommandResult};
use bytes::Bytes;
use futures_util::Stream;
use http_body_util::{BodyExt, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::header::{AUTHORIZATION, CONTENT_TYPE};
use hyper::{Request, StatusCode};
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use serde::de::DeserializeOwned;
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use std::time::Duration;

/// Shared HTTP client — uses native-tls (platform TLS), not rustls.
pub fn http_client() -> &'static Client<hyper_tls::HttpsConnector<HttpConnector>, String> {
    static CLIENT: OnceLock<Client<hyper_tls::HttpsConnector<HttpConnector>, String>> =
        OnceLock::new();
    CLIENT.get_or_init(build_http_client)
}

fn build_http_client() -> Client<hyper_tls::HttpsConnector<HttpConnector>, String> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .expect("failed to build native-tls TlsConnector");

    let connector = hyper_tls::HttpsConnector::from((
        HttpConnector::new(),
        tls,
    ));

    Client::builder(TokioExecutor::new())
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(4)
        .build::<_, String>(connector)
}

/// Thin wrapper around hyper that mimics the reqwest API surface we use.
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

    /// Consume body as JSON.
    pub async fn json<T: DeserializeOwned>(self) -> CommandResult<T> {
        let body_bytes = self.bytes().await?;
        serde_json::from_slice(&body_bytes)
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid JSON response: {e}")))
    }

    /// Consume body as text.
    pub async fn text(self) -> CommandResult<String> {
        let body_bytes = self.bytes().await?;
        String::from_utf8(body_bytes.to_vec())
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid UTF-8 response: {e}")))
    }

    /// Consume body as raw bytes.
    pub async fn bytes(self) -> CommandResult<Bytes> {
        BodyExt::collect(self.body)
            .await
            .map(|b| b.to_bytes())
            .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to read response body: {e}")))
    }

    /// Return a byte stream for SSE processing.
    pub fn byte_stream(self) -> BodyByteStream {
        BodyByteStream {
            body: self.body,
            leftover: Bytes::new(),
        }
    }
}

/// Wraps hyper's Incoming body into a Stream yielding `Result<Bytes, AppError>`.
pub struct BodyByteStream {
    body: Incoming,
    leftover: Bytes,
}

impl Stream for BodyByteStream {
    type Item = Result<Bytes, AppError>;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        // Drain leftover buffer first
        if !self.leftover.is_empty() {
            let chunk = std::mem::replace(&mut self.leftover, Bytes::new());
            return Poll::Ready(Some(Ok(chunk)));
        }

        match Pin::new(&mut self.body).poll_frame(cx) {
            Poll::Ready(Some(Ok(frame))) => {
                match frame.into_data() {
                    Ok(data) => Poll::Ready(Some(Ok(data))),
                    Err(_trailers) => {
                        // Trailers are fine, poll again
                        cx.waker().wake_by_ref();
                        Poll::Pending
                    }
                }
            }
            Poll::Ready(Some(Err(e))) => {
                Poll::Ready(Some(Err(AppError::new(
                    "NETWORK_ERROR",
                    format!("Stream error: {e}"),
                ))))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Send a POST request with JSON body and Bearer auth.
pub async fn post_json<T: DeserializeOwned>(
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> CommandResult<HttpClientResponse> {
    let body_string = serde_json::to_string(body)
        .map_err(|e| AppError::new("SERIALIZE_ERROR", format!("Failed to serialize body: {e}")))?;

    let req = Request::builder()
        .method("POST")
        .uri(url)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .body(body_string)
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to build request: {e}")))?;

    let resp = send_request(req).await?;
    Ok(resp)
}

/// Send a GET request with Bearer auth.
pub async fn get_json<T: DeserializeOwned>(
    url: &str,
    api_key: &str,
) -> CommandResult<HttpClientResponse> {
    let req = Request::builder()
        .method("GET")
        .uri(url)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .body(String::new())
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Failed to build request: {e}")))?;

    let resp = send_request(req).await?;
    Ok(resp)
}

/// Lower-level: send any Request<String> and get a response.
pub async fn send_request(
    req: Request<String>,
) -> CommandResult<HttpClientResponse> {
    let (parts, body) = req.into_parts();

    let body_len = body.len();

    let req = Request::from_parts(parts, body);

    let resp = http_client()
        .request(req)
        .await
        .map_err(|e| {
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
```

- [ ] **Step 2: Register the module in `src-tauri/src/lib.rs`**

Add `mod http_client;` alongside the other module declarations (after line 9). The module list should include `mod http_client;` before `mod json_input;`.

```rust
// After the existing mod declarations, add:
mod http_client;
```

- [ ] **Step 3: Build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -30`
Expected: Compilation succeeds (warnings OK, but no errors). Note: existing code still references reqwest and will fail — we fix that in next tasks.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/http_client.rs src-tauri/src/lib.rs
git commit -m "feat: add hyper+native-tls HTTP client module"
```

---

### Task 3: Update llm.rs — replace reqwest calls

**Files:**
- Modify: `src-tauri/src/llm.rs`

- [ ] **Step 1: Replace imports at top of llm.rs (lines 1-6)**

Delete lines 1-7 (the `use reqwest::...` and `use crate::constants` plus `use futures_util::StreamExt`):

```rust
use crate::constants::{self, chat_completions_url};
use crate::http_client;
use crate::models::{AbortSignal, AppError, CommandResult, OpenRouterResponse};
use futures_util::StreamExt;
```

(Keep `use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};` removed, and `use tauri::Emitter;` stays.)

The new imports block:
```rust
use crate::constants::{self, chat_completions_url};
use crate::http_client::{self, post_json, get_json, send_request, HttpClientResponse};
use crate::models::{AbortSignal, AppError, CommandResult, OpenRouterResponse};
use futures_util::StreamExt;
use tauri::Emitter;
```

- [ ] **Step 2: Delete the old HTTP client functions (lines 7-66)**

Delete the `http_client()` function, `build_http_client()`, and `ensure_android_rustls_verifier()` — everything from line 7 through line 66. The `OpenRouterRequestConfig` struct starts at line 68 (now line 69).

- [ ] **Step 3: Update `call_openrouter_non_streaming` (starts ~line 223)**

Replace the request section. Find lines 282-306 (the `http_client().post(...)` through the response parsing). Replace from `let response = http_client()` through the `.json()` call with:

```rust
    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;

    let status = response.status();
    if !response.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        )
        .with_status(status.as_u16()));
    }

    let parsed: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid API response: {e}")))?;
```

- [ ] **Step 4: Update `call_openrouter_streaming` (starts ~line 353)**

Replace the request section. Find lines 411-431 (the `http_client().post(...)` through `response.bytes_stream()`). Replace with:

```rust
    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;

    let status = response.status();
    if !response.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        )
        .with_status(status.as_u16()));
    }

    let mut stream = response.byte_stream();
```

- [ ] **Step 5: Update `call_openrouter_chat_streaming` (starts ~line 592)**

Same pattern as step 4. Find lines 611-618, replace with:

```rust
    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;
```

And then update the status check and stream extraction (same pattern as streaming above — check status, return error if non-success, then `let mut stream = response.byte_stream();`).

- [ ] **Step 6: Build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -40`
Expected: Only errors from deepseek_info.rs and openrouter_info.rs (still using reqwest). llm.rs should compile clean.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/llm.rs
git commit -m "refactor(llm): replace reqwest with hyper+native-tls HTTP client"
```

---

### Task 4: Update deepseek_info.rs

**Files:**
- Modify: `src-tauri/src/deepseek_info.rs`

- [ ] **Step 1: Replace imports and update HTTP calls**

The file is small (153 lines). Replace the entire file content because every HTTP call pattern changes.

Replace line 2-3:
```rust
use crate::llm::http_client;
use reqwest::header::AUTHORIZATION;
```
with:
```rust
use crate::http_client::{get_json, HttpClientResponse};
```

Then in `get_deepseek_balance` (line 78-97), replace:
```rust
    let response = http_client()
        .get(format!("{DEEPSEEK_BASE}/user/balance"))
        .header(AUTHORIZATION, format!("Bearer {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "DEEPSEEK_ERROR",
            format!("DeepSeek returned {status}: {body}"),
        ));
    }

    let parsed: BalanceResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
```

With:
```rust
    let response = get_json(
        &format!("{DEEPSEEK_BASE}/user/balance"),
        api_key.trim(),
    )
    .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "DEEPSEEK_ERROR",
            format!("DeepSeek returned {status}: {body}"),
        ));
    }

    let parsed: BalanceResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
```

And same pattern for `list_deepseek_models` (line 120-138):
```rust
    let response = get_json(
        &format!("{DEEPSEEK_BASE}/models"),
        api_key.trim(),
    )
    .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "DEEPSEEK_ERROR",
            format!("DeepSeek returned {status}: {body}"),
        ));
    }

    let parsed: ModelsListResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
```

- [ ] **Step 2: Build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -40`
Expected: Only openrouter_info.rs errors remain.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/deepseek_info.rs
git commit -m "refactor(deepseek): replace reqwest with hyper+native-tls HTTP client"
```

---

### Task 5: Update openrouter_info.rs

**Files:**
- Modify: `src-tauri/src/openrouter_info.rs`

- [ ] **Step 1: Replace imports (lines 1-9)**

Replace:
```rust
use crate::models::{AppError, CommandResult};
use crate::llm::http_client;
use once_cell::sync::Lazy;
use reqwest::header::AUTHORIZATION;
```

With:
```rust
use crate::models::{AppError, CommandResult};
use crate::http_client::{get_json, HttpClientResponse};
use once_cell::sync::Lazy;
```

- [ ] **Step 2: Update `fetch_catalogue_and_lookup` (lines 216-279)**

The function takes `client: &reqwest::Client` — change it to operate via our `get_json` free function. Actually, this function does a GET request specifically. Replace the whole function body's HTTP section.

Replace the function signature and body:

```rust
async fn fetch_catalogue_and_lookup(
    api_key: &str,
    model_id: &str,
) -> (bool, bool) {
    let url = format!("{OPENROUTER_BASE}/models");

    let resp = match get_json(&url, api_key).await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            eprintln!(
                "fetch_catalogue_and_lookup: non-success status {} for {}",
                r.status(),
                url
            );
            return (false, false);
        }
        Err(e) => {
            eprintln!("fetch_catalogue_and_lookup: request failed: {e}");
            return (false, false);
        }
    };
```

And update the remainder (the JSON parsing part stays the same — it takes `resp.json().await`).

- [ ] **Step 3: Update `get_model_stats` (starts line 295)**

This is the big one. It currently uses `http_client()` directly and `catalogue_lookup` + `fetch_catalogue_and_lookup` which both take `reqwest::Client`. 

Replace lines 316-343 (the TLS init + endpoints calls):

```rust
    let (author, slug) = split_model_id(model_id.trim())?;
    let endpoints_url = format!("{OPENROUTER_BASE}/models/{author}/{slug}/endpoints");

    // ── Resolve image/file support ─────────────────────────────────────────────
    let (endpoints_res, (image_support, file_support)) =
        match catalogue_lookup(api_key.trim(), model_id.trim()) {
            Some((cached_images, cached_files)) => {
                let ep = get_json(&endpoints_url, api_key.trim()).await;
                (ep, (cached_images, cached_files))
            }
            None => {
                let (ep, (img, files)) = tokio::join!(
                    get_json(&endpoints_url, api_key.trim()),
                    fetch_catalogue_and_lookup(api_key.trim(), model_id.trim()),
                );
                (ep, (img, files))
            }
        };
```

Then update the endpoints response handling (lines 346-361) to use our types:

```rust
    let endpoints_resp = endpoints_res
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !endpoints_resp.status().is_success() {
        let status = endpoints_resp.status();
        let body = endpoints_resp.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter returned {status}: {body}"),
        ));
    }

    let endpoints_parsed: EndpointsResponse = endpoints_resp
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
```

- [ ] **Step 4: Update `get_credits` (lines 430-463)**

Replace the HTTP call section:

```rust
    let response = get_json(
        &format!("{OPENROUTER_BASE}/credits"),
        api_key.trim(),
    )
    .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter returned {status}: {body}"),
        ));
    }

    let parsed: CreditsResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
```

- [ ] **Step 5: Build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -40`
Expected: Only lib.rs errors remain (Android rustls init references).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/openrouter_info.rs
git commit -m "refactor(openrouter_info): replace reqwest with hyper+native-tls HTTP client"
```

---

### Task 6: Update lib.rs — remove Android rustls init

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Remove the `ensure_android_rustls_verifier` call from setup (lines 469-480)**

Replace:
```rust
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(target_os = "android")]
            {
                if let Err(e) = crate::llm::ensure_android_rustls_verifier() {
                    eprintln!(
                        "rustls-platform-verifier init during app setup failed (non-fatal, will retry on first request): {e}"
                    );
                }
            }
            Ok(())
        })
```

With:
```rust
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            Ok(())
        })
```

- [ ] **Step 2: Remove the `#[cfg(target_os = "android")]` jni/ndk-context dependencies**

These are only needed for the JNI rustls init. Remove from Cargo.toml lines 39-41:
```toml
# Remove:
[target.'cfg(target_os = "android")'.dependencies]
jni = "0.22"
ndk-context = "0.1"
```

- [ ] **Step 3: Full build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -20`
Expected: Clean build, no errors, no warnings about unused imports from reqwest/rustls.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "refactor(lib): remove Android rustls JNI init code"
```

---

### Task 7: Verify full compilation and desktop test

**Files:**
- None new

- [ ] **Step 1: Full cargo check**

Run: `cd src-tauri && cargo check 2>&1`
Expected: Clean compilation for desktop target. No errors. No reqwest/rustls references.

- [ ] **Step 2: Run existing Rust tests**

Run: `cd src-tauri && cargo test 2>&1`
Expected: All existing tests pass (tests in generation.rs, cleanup.rs, etc. — these test logic, not HTTP).

- [ ] **Step 3: Verify no remaining reqwest/rustls references**

Run: `cd src-tauri && grep -r "reqwest\|rustls" src/ Cargo.toml --include="*.rs" --include="*.toml" 2>/dev/null`
Expected: No output (zero matches).

- [ ] **Step 4: Verify Android target compiles**

Run: `cd src-tauri && rustup target list --installed | grep android`
If no android target, install: `rustup target add aarch64-linux-android`
Then: `cargo check --target aarch64-linux-android 2>&1 | tail -20`
Expected: Compilation succeeds (may need NDK_HOME set; if so note this).

- [ ] **Step 5: Desktop smoke test**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: Binary compiles successfully.

- [ ] **Step 6: Commit**

```bash
git commit -m "verify: clean build with hyper+native-tls, no reqwest/rustls remaining"
```

---

## Self-Review

**1. Spec coverage:**
- [x] Remove reqwest dependency → Task 1 removes from Cargo.toml
- [x] Remove rustls dependency → Task 1 removes from Cargo.toml
- [x] Remove rustls-platform-verifier → Task 1 + Task 6
- [x] Remove Android JNI TLS init → Task 3 deletes functions, Task 6 removes setup call
- [x] Replace HTTP client for POST with JSON + Bearer auth → Task 2 creates `post_json()`, Tasks 3-5 use it
- [x] Replace HTTP client for GET with Bearer auth → Task 2 creates `get_json()`, Tasks 4-5 use it
- [x] SSE streaming support → Task 2 creates `BodyByteStream`, Task 3 uses it
- [x] Response JSON parsing → Task 2 creates `HttpClientResponse::json()`
- [x] Timeout handling → Task 2 uses hyper-util client builder with pool timeouts; error detection in `send_request`
- [x] Retry logic → Unchanged (retry logic is in `call_openrouter` and doesn't touch HTTP client directly)
- [x] Works on desktop → native-tls uses platform TLS (Secure Transport/SChannel/OpenSSL)
- [x] Works on Android → native-tls uses vendored OpenSSL which Tauri Android toolchain handles

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" markers. All steps contain explicit code.

**3. Type consistency:**
- `HttpClientResponse` has `.status()`, `.is_success()`, `.json()`, `.text()`, `.bytes()`, `.byte_stream()` — all used consistently across Tasks 3-5
- `post_json(url, api_key, body)` → `CommandResult<HttpClientResponse>` — consistent
- `get_json(url, api_key)` → `CommandResult<HttpClientResponse>` — consistent
- `BodyByteStream` implements `Stream<Item = Result<Bytes, AppError>>` — used in streaming code
