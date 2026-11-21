# Edu_chat

[简体中文](README.md) | English

An open-source DeepSeek chat client built around the Android app. Install the app, add your own API key, and start chatting.

No coding, server deployment, or Edu_chat account required. Chat on your phone, read code and equations, and export conversations you want to keep. A web version is available for browser access.

Built from [DeepSeek's official chat-demo](https://github.com/deepseek-ai/chat-demo). An independent personal project, not an official DeepSeek product.

[Download Android app](https://github.com/pc-cccc/edu_chat/releases/latest) · [Open web app](https://edu-chat-9yt.pages.dev) · [Report an issue](https://github.com/pc-cccc/edu_chat/issues)

> Current version: **v0.4.8**, with merge-by-default import, a second confirmation for replacement, and locked export selections.
> Edu_chat is free and open source. You supply your own DeepSeek API key and pay for model usage through your DeepSeek platform account.

## Get started

### 1. Install the Android app

Requires **Android 7.0 or later**. An iOS package is not currently available.

- **[Download Edu_chat_v0.4.8.apk](https://github.com/pc-cccc/edu_chat/releases/download/v0.4.8/Edu_chat_v0.4.8.apk)**, or visit [latest releases](https://github.com/pc-cccc/edu_chat/releases/latest) and select the `.apk` file under **Assets**.
- Open the APK from your phone's downloads and follow the installation prompts. If Android requests installation permission for your browser or file manager, confirm that the download came from this repository before granting it.
- You do **not** need `Source code (zip)` or `Source code (tar.gz)`. Those are developer files, not installers.

When updating, back up important conversations and install over the existing app. Do not uninstall first to work around a signature error; record the error and report it.

### 2. Get a DeepSeek API key

An API key is a credential that lets this app call DeepSeek using your account. It is not your login password or a verification code.

1. Register or sign in at the [DeepSeek platform](https://platform.deepseek.com).
2. Create and copy a key from API Keys. See the [official API introduction](https://api-docs.deepseek.com/) for the key application link.
3. Check your API balance and top up through DeepSeek if needed. Charges follow the platform's current pricing.

Access to DeepSeek's official chat app does not imply an API key or API balance. Never post your key in issues, comments, or screenshots.

### 3. Send your first message

Open Edu_chat and follow the API key prompt, or open Settings from the sidebar. Paste your key, confirm, and send “Hello.”

No server address is needed and your computer can stay off. Your phone needs an internet connection that can reach DeepSeek's API.

### Prefer a browser?

Open **[Edu_chat on the web](https://edu-chat-9yt.pages.dev)** and enter your own key. It works as a browser client on phones and computers, without deploying anything yourself.

History does **not** sync between the app, browsers, or devices. The web version stores your key and history in the current browser; use your own device and usual browser.

## Features

| Feature | What to expect |
| --- | --- |
| Chat | Streaming replies, stop generation, copy, and regenerate |
| Deep thinking | A switch for requests that benefit from additional reasoning |
| Smart search | Search when needed; currently, turn off deep thinking for more reliable search triggering |
| Rich responses | Markdown, highlighted code, math, and Mermaid diagrams |
| Local history | Keep and switch between conversations on the current device |
| Selected export | Choose one, several, or all conversations in Settings and export a ZIP |
| History import | Merge by default: skip identical content and keep conflicting same-ID conversations as copies; replacement requires a second confirmation |

Image, file, and voice capabilities depend on DeepSeek API support, your account, and network conditions. This project does not promise full feature parity with the official app. Search combined with deep thinking has known limitations.

## Backups and updates

In Settings, choose history export, select Download, check the conversations to include, and export. Keep the ZIP somewhere you can find later.

- Exports contain selected conversations and locally stored original images, but no API key.
- Other attachments include file metadata only, **not the original files**. Save important files separately.
- v0.4.8 passed 62 automated tests. The user confirmed Android upgrade continuity for history and key, ZIP save/select, non-destructive repeatable merge, and replacement confirmation/cancellation. This does not cover every device or scenario.

To move to another device, export your history, import it on the destination, and enter your key separately.

> **Import defaults to merging, preserving existing local history.** Identical content is skipped; conflicting same-ID conversations are kept as copies. Re-importing the same backup does not keep adding duplicates. Replacing all conversations is still available, but requires a second confirmation and replaces local conversations and attachments. Back up before replacing.

Check for updates in **Settings → About version → Check for updates**, or download an APK from [latest releases](https://github.com/pc-cccc/edu_chat/releases/latest). Patch updates may require a manual check.

## Costs and data

- **No rented server needed:** the published app and hosted web version use your own DeepSeek key. No public free key is provided.
- **No Edu_chat account or cloud sync:** history stays in local storage. Uninstalling the app or clearing app/browser data may remove history and credentials.
- **Not offline AI:** generating a response sends conversation content and required attachments to DeepSeek's services.
- **Key storage differs by platform:** Android prefers system-backed encrypted storage, but currently falls back to ordinary local storage if that fails. The web version uses browser local storage and does not offer equivalent protection. Direct mode does not route model requests through the maintainer's model proxy.

## Troubleshooting

| Problem | Try this |
| --- | --- |
| Download page unavailable | Try another network/browser, or try the web app |
| Invalid key | Copy it again, remove extra spaces, and check that it has not been deleted |
| Insufficient balance | Check your DeepSeek platform API balance |
| Network error | Try the web app in your phone's system browser, switch networks, and check access to the DeepSeek platform |
| Search does not trigger | Turn off deep thinking; search being enabled does not mean every request will search |
| History missing on another device | Export/import manually; local history does not sync |

If the problem continues, [open an issue](https://github.com/pc-cccc/edu_chat/issues) with app/web version, device/browser, steps, and the error. Remove keys and private conversations from screenshots.

## Development progress

The **Android app's everyday usability** is the priority; the website is a companion entry point. v0.4.8 adds merge-by-default import, replacement confirmation, and locked export selections, with the Android checks described above completed. Next priorities are device compatibility and the interaction between search and thinking. iOS and cloud sync are not currently provided.

If Edu_chat is useful to you, give it a **Star** to help others discover it. Specific feedback about confusing steps and awkward interactions is welcome.

## For developers

App users can skip this section.

<details>
<summary>Source setup and builds</summary>

React 18, TypeScript, Rspack, Zustand, and Capacitor. Active branch: `mobile`. Published app/web builds use `direct` mode.

Requires Node.js 22.12+. If Windows blocks `npm.ps1`, use `npm.cmd` instead.

```sh
git clone --branch mobile https://github.com/pc-cccc/edu_chat.git
cd edu_chat
npm ci
npm run dev:direct
```

Open `http://127.0.0.1:8090` and enter a key in the UI. For a fixed-response preview without a key, use `npm run demo` and open `http://127.0.0.1:8092`.

```sh
npm run build:direct
npm run build:android:direct
npm run android:sync
npm run android:open
```

The web build is written to `dist/`. Android builds also require a JDK and Android SDK; complete packaging in Android Studio. The v0.4.8 APK is a debug build. Manage signing consistently for future distribution and upgrades; never commit keys or signing files.

Legacy Node, Cloudflare, and Supabase implementations remain in the repository. [Serverless docs](docs/SERVERLESS.md), [old verification records](docs/VERIFICATION.md), and [Android build history](docs/ANDROID.md) describe earlier setups, not current end-user onboarding.

</details>

## Credits and license

Thanks to [DeepSeek's official chat-demo](https://github.com/deepseek-ai/chat-demo) for the foundation. Upstream copyright and the [MIT license](LICENSE) are retained; see [NOTICE.md](NOTICE.md). Edu_chat's name and key icon identify this independent project, not an official DeepSeek product.
