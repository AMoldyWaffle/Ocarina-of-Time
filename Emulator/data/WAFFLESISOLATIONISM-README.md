# WafflesIsolationism (rebranded EmulatorJS data package)

This package is a user-interface rebrand of the supplied EmulatorJS 4.2.3 data directory.

## What changed
- Visible product labels in the emulator menu and exit/runtime messages now say **WafflesIsolationism**.
- Visible product-name translations were updated where the original labels appeared.
- Existing emulator cores, core assets, configuration formats, and directory layout were retained.

## What did not change
- This is still based on EmulatorJS; it is not an independently written emulator.
- Upstream attribution, license notices, and upstream project links are retained.
- Existing network destinations and fallback/update behavior are unchanged. This rebrand does not hide or disguise network traffic and does not make blocked connections work.
- The original GPL-3.0 licensing terms and bundled core-specific licenses still apply. Review the included license files before redistributing.

## Usage
Use this `data/` directory in place of the original EmulatorJS `data/` directory in a compatible EmulatorJS deployment. The surrounding page/launcher must still configure the usual EJS settings and point its data path at this directory.
