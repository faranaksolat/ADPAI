# ADPAI interface 1.8.0

The consumer interface now opens a compact dashboard with two clear entry points,
Shopping and Restaurant menu. A desktop rail becomes three fixed navigation
actions on phones. Navigation is real, indicates the current page, preserves
mode-specific photos and locks during capture/inference. Mode changes reset
visible results, focus the new heading and return to the top. Re-selecting the
current navigation tab preserves its result. Versioned styles prevent the old
offline shell from applying the previous release's stylesheet to a fresh page.

The workflow shows ingredients, photos and review progress. Illustrated allergen
tiles retain native keyboard-accessible checkboxes. A Continue to photos action
focuses the upload heading, without hiding the selected profile. Camera capture is
the primary upload action, while the gallery remains separately labeled. Result
warnings, original evidence and ingredient explanations remain visible. Technical
model details remain inside expandable evidence. No calorie UI is added.

The layout uses a shared light canvas, evergreen accent, restrained borders and
inline vector icons. It loads no remote font, tracker or new UI dependency. Small
screens, Korean word wrapping, reduced motion, keyboard focus and device safe areas
are supported. The private PC companion adopts the shared controls, spacing and
photo upload treatment, keeping its separate upload/privacy notice.

Version 1.8.0 is aligned across the module/cache graph, package manifests,
Android versionCode8 and iOS build8. The Android build remains a debug test APK;
there is no store publication. Existing APKs do not update when Pages changes.

## Scope and validation

- 123 JavaScript and 46 Python tests pass, including fail-closed rules, photo
  isolation, server authentication and failures. Recognition modules differ from
  1.7.0 only in their versioned import strings; this is not a new model benchmark.
- Controlled browser checks exercise actual navigation hit areas, current-page
  state, heading focus, progress, English/Korean, crop/restore, camera cancellation,
  denied permission, locked controls, mode isolation, stale results and offline PWA.
  Phone320/390, tablet820 and desktop1440 widths are checked for horizontal overflow.
- The same shared page is bundled into Android. Mobile web checks and a generated
  label/menu offline OCR check validate web assets and engine loading; neither is
  physical Android/iOS camera or real-food accuracy validation.
- APK contents are compared byte-for-byte with dist, its signature is verified,
  and versionName/versionCode are inspected. iOS project metadata is updated;
  this Linux environment does not build or sign an iPhone binary.

No domain, DNS entry, hosting subscription, paid API or credit balance is changed.
The PC server still needs to be run on the user's own machine and does not become
part of the installed app automatically. See the domain/hosting guide before
choosing a permanent public deployment.
