# PicoShare Uploader

Chrome/Edge Manifest V3 extension for the PicoShare API.

The extension UI supports Simplified Chinese and English. It follows the browser language by default; change **Language** in the popup to select a language or return to the browser default.

The privacy policy is published at `https://pico.justnow.uk/privacy`. The popup shows a data-use notice and requires your confirmation before upload features are enabled.

## Features

- Upload a local file from the extension popup and copy its share URL.
- Optionally show a persistent, draggable PicoShare button on web pages. Its position is remembered across pages; left-click opens a menu for a full-page PNG screenshot, a local file, or current-page HTML; right-click saves the page URL as a text file with query parameters and fragments removed.
- Right-click a web page to upload the current page HTML source.
- Right-click an HTTP(S) image to upload it and open its share URL.
- Use chunked upload automatically for files at or above 100 MiB.
- Show an in-popup success card, a browser notification, and a toolbar badge after upload.

## Install locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` directory.
4. Open the extension popup, enter your PicoShare site URL and an API Key created in **Account & Subscription → API Keys**, then choose **Save and grant access**.
5. Optionally enable the floating page button in the popup. Chrome will ask for all-sites access, which the extension needs for the persistent button and full-page screenshot. The button is injected only into ordinary HTTP and HTTPS pages. You can turn it off from the popup.
6. Choose a local file to upload, use the page/image right-click menu, or use the floating button menu without opening the toolbar popup.

If the extension was already loaded, click its **Reload** button on `chrome://extensions` to apply updates and accept the notifications permission.

The API Key is stored in `chrome.storage.local` in this browser profile. The extension requests host access only for the configured PicoShare origin. Saving an image from another website asks for access to that image's origin when you use the context menu. These permissions are needed for cross-origin requests from the extension. The `notifications` permission is used to show an upload-complete notification; clicking it opens the share URL. The toolbar badge is a fallback cue.

The floating page button is off by default and uses optional all-sites permission. Its left-click menu can capture and upload the visible page width as a stitched full-page PNG, upload a selected local file, or save the current DOM as an HTML text file. Right-click saves the page URL as a text file with query parameters and fragments removed to avoid sharing URL tokens by accident. It skips restricted browser pages such as `chrome://` pages and the Chrome Web Store.

## HTML and image behavior

The popup and result page use the PicoShare logo from `public/favicon.svg`; PNG sizes are generated from that same SVG for Chrome's manifest icons, since Chrome does not accept SVG files in manifest icon declarations. The page menu captures the current DOM as an `.html` file. Share links render static HTML in a sandbox: scripts, forms, and API connections are disabled, while remote images and styles may load. The capture can include private information currently present in the page; review the page before uploading.

Image saving supports `http://` and `https://` image URLs. `data:` and `blob:` images are not currently supported. An image website may still reject the extension's fetch request, for example when it requires a special referrer or blocks access.

## API behavior

Uploads use `POST /api/entry`. Files at or above 100 MiB use the multipart endpoints. Share URLs use the public `/-{id}` route, so anyone with the link can access the file. API request limits and storage/file size limits are enforced by PicoShare.
