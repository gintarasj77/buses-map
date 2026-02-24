# Release Checklist

Use this checklist for each release (`vX.Y.Z`).

## 1. Prepare

- Update `CHANGELOG.md`:
  - Move relevant items from `Unreleased` into a new version section.
  - Add release date in `YYYY-MM-DD` format.
- Confirm `README.md` reflects current behavior.
- Ensure `package.json` version is correct if you are versioning there.

## 2. Validate

- Run all checks:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Confirm working tree is clean except intended release changes.

## 3. Tag and Publish

- Commit release docs/metadata updates.
- Create annotated tag:
  - `git tag -a vX.Y.Z -m "vX.Y.Z: short summary"`
- Push commit and tag:
  - `git push origin main --tags`
- Create GitHub Release from the tag with highlights.

## 4. Start Next Cycle

- Add a fresh `Unreleased` section in `CHANGELOG.md` (if needed).
- Add the first queued items for the next release.
