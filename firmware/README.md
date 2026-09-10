# What goes in this folder

Three files come straight out of the Arduino build folder for `Imposter147.ino`,
renamed. Drop them in here, commit, and the Update section of the site starts
working on its own. Nothing in `index.html` needs touching.

| Build output                       | Rename it to                  | Where it is written |
| ---------------------------------- | ----------------------------- | ------------------- |
| `Imposter147.ino.bootloader.bin`   | `imposter147-bootloader.bin`  | 0x0                 |
| `Imposter147.ino.partitions.bin`   | `imposter147-partitions.bin`  | 0x8000              |
| `Imposter147.ino.bin`              | `imposter147.bin`             | 0x10000             |

The build folder is the one arduino-cli reports at the end of a compile, under
`%LOCALAPPDATA%\arduino\sketches\<hash>\`.

## Why three files and not one merged one

Saved settings live in NVS at 0x9000, which sits in the gap between the
partition table and the app. A single merged binary written from 0x0 would pad
that gap with 0xFF and wipe the owner's brightness, theme, tips and lock
setting. Three parts at their own offsets step over it, so an update keeps
everything the owner set.

Listing the bootloader and the partition table as well as the app means a board
that has somehow been wiped can still be brought back from this page, instead of
only boards that already boot.

## Do not turn the erase prompt on

`new_install_prompt_erase` is `false` on purpose. With it true the dialog offers
a full chip erase, and a chip erase followed by a partial write leaves a board
that does not boot. There is no BOOT button on the sold units, so that board can
only be recovered by shorting the pads with tweezers. Leave it false.

## When you cut a new release

Bump `"version"` in `manifest.json`. It is the number the install dialog shows
the owner.
