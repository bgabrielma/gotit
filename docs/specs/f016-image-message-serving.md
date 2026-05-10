# F016 — Image Message Serving

> **Status:** Spec — awaiting plan
> **Priority:** High — blocks correct chat history display
> **Depends on:** F001 Phase 1a (backend complete), F014 (Postgres storage)

---

## Problem

`screen_capture` messages are already persisted to the database with an `image_ref` field and the image file is already written to `{dataDir}/images/{uuid}.png` by the capture route. However:

1. There is no HTTP endpoint to serve the image file.
2. The macOS client renders `screen_capture` messages as `"📷 " + summary` text — the image is never displayed.
3. On app relaunch, the image preview is permanently lost from the chat history.

The result is that screen captures appear as pseudo-messages: present in history as text, but with no visual record of what was actually captured.

---

## Goal

Add a `GET /images/:imageRef` endpoint to the backend and update the macOS `MessageRow` to display the image lazily. After this change, every `screen_capture` message shows the actual captured image, persists across relaunches, and loads without blocking the UI thread.

---

## Scope

**In scope:**

- Backend image serving route (`packages/api`)
- macOS `MessageRow` image display with lazy loading and loading/error states (`GotItUI`, `GotItModels`)
- `APIClient` protocol extension for typed image fetching

**Out of scope:**

- Image expiry / deletion policy
- Thumbnail generation / resizing
- Full-size image viewer / zoom (future)
- Caching layer beyond OS-level `URLSession` deduplication

---

## Architecture

### Backend — `GET /images/:imageRef`

**File:** `packages/api/src/routes/images.ts`

- Requires device auth via `deviceAuth` middleware (same as all other routes).
- Path traversal guard: reject any `imageRef` containing `/`, `\`, or `..` with `400 Bad Request`.
- Constructs the file path: `path.join(deps.dataDir, 'images', imageRef)`.
- If the file does not exist → `404 Not Found`.
- If the file exists → stream it with `Content-Type: image/png` using `res.sendFile`.
- Wired in `app.ts` as `app.use('/images', imagesRouter(deps))`.

No new `AppDeps` fields required — `dataDir` is already present.

### macOS — `ImageLoader`

**File:** `GotItUI/Sources/GotItUI/Chat/ImageLoader.swift`

An `@Observable` class (Swift 5.9 observation). Owns a single image fetch lifecycle.

```
ImageLoader
  + init(imageURL: URL, token: String?)
  + state: LoadState   { loading | loaded(NSImage) | failed }
  + load()             → fires URLRequest with Authorization header, off main actor
  + cancel()           → cancels in-flight Task
```

- `load()` builds a `URLRequest` for `{baseURL}/images/{imageRef}`, attaches `Authorization: Bearer {token}` if token is non-nil, fires via `URLSession.shared.data(for:)`.
- On success: decodes `Data` → `NSImage`, publishes `.loaded`.
- On failure (network error, 404, non-image data): publishes `.failed`.
- Called from `.task {}` modifier on the view; cancelled on disappear.

### macOS — `MessageRow` update

**File:** `GotItUI/Sources/GotItUI/Chat/MessageRow.swift`

Replace the `.screenCapture` case:

**Before:**

```swift
case .screenCapture(let p): bubble(text: "📷 " + p.analysis.summary, role: .assistant)
```

**After:**

```swift
case .screenCapture(let p): captureImageBubble(imageRef: p.imageRef)
```

`captureImageBubble` renders three states driven by `ImageLoader.state`:

- **Loading:** grey `RoundedRectangle` placeholder, 16:9 aspect ratio, full bubble width, animated shimmer (optional) or static grey.
- **Loaded:** `Image(nsImage:)` resizable, `.scaledToFit`, clipped with `cornerRadius(8)`, full bubble width, left-aligned.
- **Failed:** grey placeholder with a small `photo.slash` SF Symbol centered.

`MessageRow` receives `imageBaseURL: URL` and `imageToken: String?` as init parameters so `ImageLoader` can be constructed with the correct endpoint and auth. These are passed down from `ChatView` which already holds the `APIClient`.

### macOS — `APIClient` protocol

Add a helper method to `URLSessionAPIClient` (not to the `APIClient` protocol — this is a concrete, infrastructure-level concern):

```swift
func imageURL(for imageRef: String) -> URL {
    baseURL.appendingPathComponent("images/\(imageRef)")
}
```

`ChatView` calls `api.imageURL(for:)` and passes the result into each `MessageRow`. Token is read from keychain the same way as other requests.

---

## Data Flow

```
screen_capture message loaded from DB
  └─▶ MessageRow(.screenCapture(p))
        └─▶ captureImageBubble(imageRef: p.imageRef)
              └─▶ ImageLoader(url: baseURL/images/{imageRef}, token: token)
                    └─▶ URLRequest → GET /images/{imageRef}
                          └─▶ images.ts → sendFile({dataDir}/images/{imageRef})
                                └─▶ NSImage → Image(nsImage:) rendered in bubble
```

---

## Error Handling

| Scenario               | Backend | Client                                      |
| ---------------------- | ------- | ------------------------------------------- |
| File missing from disk | 404     | `.failed` state → grey placeholder          |
| Path traversal attempt | 400     | `.failed` state                             |
| Network error          | —       | `.failed` state                             |
| Image data corrupt     | —       | `NSImage(data:)` returns nil → `.failed`    |
| Slow network           | —       | `.loading` placeholder shown until resolved |

---

## Testing

### Backend (packages/api)

- Unit: path traversal rejection (imageRef with `/`, `\`, `..`)
- Integration: `GET /images/:imageRef` returns 200 + PNG bytes for existing file
- Integration: 404 for unknown imageRef
- Integration: 401 for missing auth token

### macOS (GotItUI)

- `ImageLoader` unit tests: `.loaded` on success, `.failed` on network error, `.failed` on non-image data, cancellation cleans up task
- `MessageRow` snapshot / UI tests: loading state renders placeholder, loaded state renders image

---

## Spec Terminology

| Term                 | Location                                                    |
| -------------------- | ----------------------------------------------------------- |
| `imageRef`           | `screen_capture` message field, image filename              |
| `ImageLoader`        | `GotItUI` observable class                                  |
| `LoadState`          | `ImageLoader` published state enum                          |
| `captureImageBubble` | `MessageRow` rendering function for `.screenCapture`        |
| `imagesRouter`       | Express router factory, `packages/api/src/routes/images.ts` |
| `imageURL(for:)`     | `URLSessionAPIClient` helper method                         |

---

## File Map

| Action | File                                                           | Notes                                   |
| ------ | -------------------------------------------------------------- | --------------------------------------- |
| Create | `packages/api/src/routes/images.ts`                            | New image serving route                 |
| Create | `packages/api/src/__tests__/integration/routes/images.test.ts` | Integration tests                       |
| Modify | `packages/api/src/app.ts`                                      | Wire `/images` route                    |
| Create | `GotItUI/Sources/GotItUI/Chat/ImageLoader.swift`               | Observable image loader                 |
| Modify | `GotItUI/Sources/GotItUI/Chat/MessageRow.swift`                | Replace text with image bubble          |
| Modify | `GotItUI/Sources/GotItUI/Chat/ChatView.swift`                  | Pass imageBaseURL + token to MessageRow |
| Modify | `GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift`  | Add `imageURL(for:)`                    |
| Modify | `GotItUI/Tests/GotItUITests/`                                  | ImageLoader unit tests                  |
