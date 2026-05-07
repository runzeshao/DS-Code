const path = require("path");
const os = require("os");

const CHECKSUM_MANIFEST = "ds-artifacts-sha256.txt";

const ASSET_MATRIX = {
  linux: {
    x64: ["ds-linux-x64", "DS-Code-linux-x64"],
    arm64: ["ds-linux-arm64", "DS-Code-linux-arm64"],
  },
  darwin: {
    x64: ["ds-macos-x64", "DS-Code-macos-x64"],
    arm64: ["ds-macos-arm64", "DS-Code-macos-arm64"],
  },
  win32: {
    x64: ["ds-windows-x64.exe", "DS-Code-windows-x64.exe"],
  },
};

function detectBinaryNames() {
  const platform = os.platform();
  const arch = os.arch();
  const defaults = ASSET_MATRIX[platform];
  if (!defaults) {
    const supported = Object.keys(ASSET_MATRIX).map(p => `'${p}'`).join(', ');
    throw new Error(
      `Unsupported platform: ${platform}. Supported platforms: ${supported}.\n\n` +
      unsupportedBuildHint(),
    );
  }
  const pair = defaults[arch];
  if (!pair) {
    const supported = Object.keys(defaults).map(a => `'${a}'`).join(', ');
    throw new Error(
      `Unsupported architecture: ${arch} on platform ${platform}. ` +
      `Supported architectures: ${supported}.\n\n` +
      unsupportedBuildHint(),
    );
  }
  return {
    platform,
    arch,
    deepseek: pair[0],
    tui: pair[1],
  };
}

function unsupportedBuildHint() {
  return [
    "No prebuilt binary is available for this platform/architecture combo.",
    "You can still run DeepSeek TUI by building from source with Cargo:",
    "",
    "  # Requires Rust 1.88+ (https://rustup.rs)",
    "  cargo install DS-Code-cli --locked   # provides `deepseek`",
    "  cargo install DS-Code     --locked   # provides `DS-Code`",
    "",
    "Or build from a checkout:",
    "",
    "  git clone https://github.com/Hmbown/DS-Code.git",
    "  cd DS-Code",
    "  cargo install --path crates/cli --locked",
    "  cargo install --path crates/tui --locked",
    "",
    "See https://github.com/Hmbown/DS-Code/blob/main/docs/INSTALL.md",
    "for cross-compilation, mirror, and Linux ARM64 specifics.",
  ].join("\n");
}

function executableName(base, platform) {
  return platform === "win32" ? `${base}.exe` : base;
}

function releaseBaseUrl(version, repo = "Hmbown/DS-Code") {
  const override =
    process.env.DS_TUI_RELEASE_BASE_URL || process.env.DS_RELEASE_BASE_URL;
  if (override) {
    const trimmed = String(override).trim();
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return `https://github.com/${repo}/releases/download/v${version}/`;
}

function releaseAssetUrl(baseName, version, repo = "Hmbown/DS-Code") {
  return new URL(baseName, releaseBaseUrl(version, repo)).toString();
}

function checksumManifestUrl(version, repo = "Hmbown/DS-Code") {
  return releaseAssetUrl(CHECKSUM_MANIFEST, version, repo);
}

function releaseBinaryDirectory() {
  return path.join(__dirname, "..", "bin", "downloads");
}

function allAssetNames() {
  const names = [];
  for (const platformAssets of Object.values(ASSET_MATRIX)) {
    for (const pair of Object.values(platformAssets)) {
      names.push(pair[0], pair[1]);
    }
  }
  return Array.from(new Set(names));
}

function allReleaseAssetNames() {
  return [...allAssetNames(), CHECKSUM_MANIFEST];
}

module.exports = {
  allAssetNames,
  allReleaseAssetNames,
  CHECKSUM_MANIFEST,
  checksumManifestUrl,
  detectBinaryNames,
  executableName,
  releaseAssetUrl,
  releaseBaseUrl,
  releaseBinaryDirectory,
};
