
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
    val cargoLock = File(tauriDir, "Cargo.lock")
    val version = Regex("""name = \"rustls-platform-verifier-android\"\s+version = \"([^\"]+)\"""")
        .find(cargoLock.readText())
        ?.groupValues
        ?.get(1)
        ?: error("Unable to resolve rustls-platform-verifier-android version from Cargo.lock")

    val cargoRegistrySrc = File(System.getProperty("user.home"), ".cargo/registry/src")
    val registryRoots = cargoRegistrySrc.listFiles()
        ?.filter { it.isDirectory && it.name.startsWith("index.crates.io-") }
        .orEmpty()

    val mavenDir = registryRoots
        .asSequence()
        .map { File(it, "rustls-platform-verifier-android-$version/maven") }
        .firstOrNull { it.isDirectory }
        ?: error("Unable to locate rustls-platform-verifier-android maven repo in the local cargo registry")

    return mavenDir.toURI()
}

tasks.register("clean").configure {
    delete("build")
}
