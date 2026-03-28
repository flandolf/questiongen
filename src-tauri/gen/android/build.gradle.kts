
import groovy.json.JsonSlurper

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven {
            url = findRustlsPlatformVerifierMaven()
            metadataSources.artifact()
        }
    }
}

fun findRustlsPlatformVerifierMaven(): java.net.URI {
    val tauriDir = File(project.rootDir, "../..").canonicalFile
    val stdout = java.io.ByteArrayOutputStream()
    exec {
        workingDir = tauriDir
        commandLine("cargo", "metadata", "--format-version", "1", "--filter-platform", "aarch64-linux-android", "--manifest-path", "Cargo.toml")
        standardOutput = stdout
    }
    val dependencyJson = JsonSlurper().parseText(stdout.toString()) as Map<*, *>
    val packages = dependencyJson["packages"] as List<*>
    val manifestPath = packages
        .filterIsInstance<Map<*, *>>()
        .first { it["name"] == "rustls-platform-verifier-android" }["manifest_path"] as String
    return uri(File(File(manifestPath).parentFile, "maven").path)
}

tasks.register("clean").configure {
    delete("build")
}
