#!/bin/bash
# Mac acceptance-test installer. Uses only macOS tools; no network downloads.
set -euo pipefail

hive_package_dir="$(cd "$(dirname "$0")" && /bin/pwd -P)"
hive_expected_arch="@ARCH@"
hive_expected_version="@VERSION@"
hive_expected_asar="@ASAR_SHA256@"
hive_stage=""

hive_finish() {
    hive_status=$?
    trap - EXIT
    if [ "$hive_status" -ne 0 ]; then
        printf '\nInstallation stopped. Your saved Hive memory has not been changed.\n'
        if [ -n "$hive_stage" ]; then
            printf 'Temporary test files, if present: %s\n' "$hive_stage"
        fi
        printf 'Send the error above to the person who supplied this package.\n'
    fi
    if [ -t 0 ]; then
        printf '\nPress Return to close this installer. '
        IFS= read -r hive_reply || true
    fi
    exit "$hive_status"
}
trap hive_finish EXIT

hive_fail() {
    printf '\n%s\n' "$1" >&2
    exit 1
}

printf 'Southlake Hive %s - Mac test installation\n\n' "$hive_expected_version"
printf 'This prepares a local test copy, not an Apple-notarized release.\n'
printf 'Close any open Southlake Hive windows before installing.\n\n'

[ "$(/usr/bin/uname -s)" = Darwin ] || hive_fail 'This installer runs on a Mac only.'
hive_os_version="$(/usr/bin/sw_vers -productVersion)"
hive_os_major="${hive_os_version%%.*}"
case "$hive_os_major" in
    ''|*[!0-9]*) hive_fail 'Could not determine this Mac version.' ;;
esac
[ "$hive_os_major" -ge 13 ] || hive_fail 'Hive requires macOS 13 Ventura or newer.'

# sysctl identifies Apple Silicon even when Terminal is running through Rosetta.
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
    hive_actual_arch=arm64
else
    hive_actual_arch=x64
fi
[ "$hive_actual_arch" = "$hive_expected_arch" ] || hive_fail 'This package is for the other Mac chip. Ask for the Apple Silicon or Intel ZIP that matches About This Mac.'

hive_source_app="$hive_package_dir/Southlake Hive.app"
hive_source_info="$hive_source_app/Contents/Info.plist"
hive_source_asar="$hive_source_app/Contents/Resources/app.asar"
hive_entitlements="$hive_package_dir/Support/main-entitlements.plist"
[ -f "$hive_source_info" ] && [ -f "$hive_source_asar" ] && [ -f "$hive_entitlements" ] || hive_fail 'Keep the installer, Support folder and Southlake Hive.app together in the extracted folder.'
[ -x "$hive_source_app/Contents/MacOS/Electron" ] || hive_fail 'The app executable is missing or its permissions were lost. Extract the original ZIP using Finder.'
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$hive_source_info")" = org.team26.southlakehive ] || hive_fail 'Unexpected app identity. Download the package again from your sender.'
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$hive_source_info")" = "$hive_expected_version" ] || hive_fail 'The installer and app versions do not match.'
hive_actual_asar="$(/usr/bin/shasum -a 256 "$hive_source_asar")"
hive_actual_asar="${hive_actual_asar%% *}"
[ "$hive_actual_asar" = "$hive_expected_asar" ] || hive_fail 'The app contents failed the download check. Download and extract the ZIP again.'

hive_user_home="$(cd "${HOME:?}" && /bin/pwd -P)"
hive_user_apps="$hive_user_home/Applications"
[ ! -L "$hive_user_apps" ] || hive_fail 'Your Applications folder is a link. Ask IT to install this test copy.'
/bin/mkdir -p "$hive_user_apps"
hive_target_app="$hive_user_apps/Southlake Hive.app"
[ ! -L "$hive_target_app" ] || hive_fail 'The existing Hive app is a link. Ask IT to install this test copy.'
if /bin/ps -axo comm= | /usr/bin/grep -Fx "$hive_target_app/Contents/MacOS/Electron" >/dev/null; then
    hive_fail 'Southlake Hive is still running. Quit Hive, then open this installer again.'
fi
if [ -e "$hive_target_app" ]; then
    [ -d "$hive_target_app" ] || hive_fail 'A different file named Southlake Hive.app is already in your Applications folder.'
    [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$hive_target_app/Contents/Info.plist")" = org.team26.southlakehive ] || hive_fail 'An app with a different identity is already at the destination. Ask IT before replacing it.'
fi

hive_stage="$(/usr/bin/mktemp -d "$hive_user_apps/.southlake-hive-install.XXXXXX")"
printf 'Copying Hive and its bundled English voice model...\n'
/usr/bin/ditto "$hive_source_app" "$hive_stage/Southlake Hive.app"
hive_staged_asar="$(/usr/bin/shasum -a 256 "$hive_stage/Southlake Hive.app/Contents/Resources/app.asar")"
hive_staged_asar="${hive_staged_asar%% *}"
[ "$hive_staged_asar" = "$hive_expected_asar" ] || hive_fail 'The copied app failed its contents check.'

printf 'Preparing the local test signature...\n'
# Re-sign only the changed outer app. Official nested Electron code is untouched.
# This does not remove quarantine, change Gatekeeper or grant any permission.
/usr/bin/codesign --force --sign - --timestamp=none --entitlements "$hive_entitlements" "$hive_stage/Southlake Hive.app"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$hive_stage/Southlake Hive.app"

hive_backup=""
if [ -e "$hive_target_app" ]; then
    hive_backup="$(/usr/bin/mktemp -d "$hive_user_apps/Southlake Hive Previous App.XXXXXX")"
    /bin/mv "$hive_target_app" "$hive_backup/Southlake Hive.app"
fi
if ! /bin/mv "$hive_stage/Southlake Hive.app" "$hive_target_app"; then
    if [ -n "$hive_backup" ]; then
        /bin/mv "$hive_backup/Southlake Hive.app" "$hive_target_app" || true
    fi
    hive_fail 'Could not move the prepared app into your Applications folder.'
fi
/bin/rmdir "$hive_stage"
hive_stage=""

printf '\nInstalled: %s\n' "$hive_target_app"
if [ -n "$hive_backup" ]; then
    printf 'Previous app kept at: %s\n' "$hive_backup"
fi
printf 'Your memory stays in ~/Library/Application Support/Southlake Hive.\n'
printf '\nDouble-click Southlake Hive in the Finder window to open it.\n'
printf 'If macOS blocks the app, stop and ask your sender or IT for approval.\n'
printf 'Do not turn off Mac security protections.\n'
/usr/bin/open -R "$hive_target_app" || true
