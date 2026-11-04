# PicoShare API reference for agent workflows

Set `PICOSHARE_BASE_URL` to the PicoShare site URL, preserving any deployment path prefix, and `PICOSHARE_API_KEY` to a key belonging to the account that owns the requested data. Use `X-API-Key: $PICOSHARE_API_KEY` on authenticated requests. The API also accepts the Bearer form. API Key requests count toward the account's monthly request quota.

Keep the API Key in the request header. Never include it in a public share URL or in a response to the user.

## Upload and share a file

For files smaller than 100 MiB, upload multipart form data:

```sh
curl -sS -X POST "$PICOSHARE_BASE_URL/api/entry" \
  -H "X-API-Key: $PICOSHARE_API_KEY" \
  -F "file=@${FILE_PATH}" \
  -F "note=Optional private note" \
  -F "expirationDays=30"
```

`file` is required for a file upload. `note` is optional and limited to 1,000 characters. `expirationDays` is optional; account plan limits may be lower than the API maximum of 3,650 days. A successful response contains an `id`. Build the public share URL as:

```text
<PICOSHARE_BASE_URL>/-<id>
```

Anyone with the file share URL can access the file. Do not share it unless the user asked for a share link.

To list and search files, call `GET /api/entries`; it returns the account's full file array. The endpoint has no server-side search or pagination parameters. Filter by `filename` and/or `note` in the agent. `GET /api/entry/{id}` returns one file's metadata and download count. `GET /-<id>` returns the public file content and does not need an API Key.

## Large files (100 MiB or larger)

The direct upload route is intended for files below 100 MiB. For larger files, use the multipart endpoints and send the API Key on every request:

1. `POST /api/entry/multipart/init` with JSON fields `filename`, `contentType`, `size`, and optional `note` and `expirationDays`. Example:

   ```json
   {"filename":"archive.zip","contentType":"application/zip","size":123456789,"note":"backup"}
   ```

   The response contains `uploadId`, `id`, and `chunkSize` (8 MiB).
2. Split the file into chunks no larger than `chunkSize`. Send each chunk as the raw request body to `PUT /api/entry/multipart/part/{uploadId}/{partNumber}`. Part numbers start at 1. Use `Content-Type: application/octet-stream`.
3. Finish with `POST /api/entry/multipart/complete` and JSON `{"uploadId":"UPLOAD_ID"}`. The response contains the file `id` and metadata; construct the share URL using the same `/-<id>` format.
4. If the upload fails before completion, call `POST /api/entry/multipart/abort` with the upload ID when possible.

## Cloud notes

Cloud notes use the clipboard API, not the file API. In SaaS mode, authenticated list and item routes require the account's API Key.

### List notes

```sh
curl -sS "$PICOSHARE_BASE_URL/clipboard-api/list" \
  -H "X-API-Key: $PICOSHARE_API_KEY"
```

The response is an array with `slug`, `publicId`, `updatedAt`, `charCount`, `itemCount`, and `hasPassword` for each note.

### Read a private account note

```sh
curl -sS "$PICOSHARE_BASE_URL/clipboard-api/item/${SLUG}" \
  -H "X-API-Key: $PICOSHARE_API_KEY"
```

An unknown slug returns an empty note object; a `GET` does not create the note. The content response includes `content`, `createdAt`, `updatedAt`, `itemCount`, `lineCount`, and `charCount`.

### Create or update a note

```sh
curl -sS -X PUT "$PICOSHARE_BASE_URL/clipboard-api/item/${SLUG}" \
  -H "X-API-Key: $PICOSHARE_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{"content":"The note contents go here."}
JSON
```

`PUT` creates a new note or replaces all content at an existing slug. The content limit is 1,000,000 characters. A successful SaaS response includes a `publicId`; construct the public URL as:

```text
<PICOSHARE_BASE_URL>/c/<publicId>
```

Before replacing an existing slug, read its content and only proceed if the user requested that update. A public URL allows read-only access to that note to anyone who has it.

Slugs are trimmed and lowercased; spaces become hyphens. Use at most 64 letters, numbers, underscores, or hyphens. A slug cannot start or end with a hyphen. Avoid reserved route names such as `api`, `guest`, `clips`, and `_preview`. URL-encode the slug when constructing requests.

### Read a public note

`GET /clipboard-api/public/{publicId}` is read-only and does not require an API Key:

```sh
curl -sS "$PICOSHARE_BASE_URL/clipboard-api/public/${PUBLIC_ID}"
```

If the note is password-protected, add `-H "X-Clip-Password: $CLIP_PASSWORD"`. Missing or incorrect passwords return `401`.

### Set or remove a note password

The owner can call `PUT /clipboard-api/item/{slug}/password` with an API Key:

```sh
curl -sS -X PUT "$PICOSHARE_BASE_URL/clipboard-api/item/${SLUG}/password" \
  -H "X-API-Key: $PICOSHARE_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '{"newPassword":"choose-a-password"}'
```

Set `newPassword` to `null` to remove the password. Passwords are limited to 128 characters. There is no cloud-note delete endpoint.

## Common errors

- `400`: malformed input, invalid slug, or note too large.
- `401`: invalid/missing API Key, or missing/incorrect `X-Clip-Password` for a protected public note.
- `404`: unknown file or unknown public note ID.
- `413`: file size or storage limit exceeded.
- `429`: monthly API request quota reached.
