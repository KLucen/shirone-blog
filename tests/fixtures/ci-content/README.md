# CI content source

GitHub Actions uses this small, public content source through `CONTENT_DIR`.
It exercises the same content synchronization and configuration generation as
production without credentials or access to the private content repository.

The sample post, about page, series, and moment cover content routes. Empty data collections
provide the modules imported by the theme, and configuration uses the tracked
public logo instead of personal images. Music is disabled so font collection
does not depend on a remote playlist. Resolver unit tests supply their own
items rather than depending on this site's data.

This directory is only selected by `.github/workflows/ci.yml`. Production
continues to use `shirone.content.json` and its configured content repository.
Do not set production's `CONTENT_DIR` to this fixture.
