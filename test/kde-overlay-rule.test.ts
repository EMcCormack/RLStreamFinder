import { describe, expect, it } from "vitest";
import { planKdeOverlayRule } from "../src/main/services/kde-overlay-rule";

const devClass = "com.emcormack.rlstreamfinder.dev";
const packagedClass = "com.emcormack.rlstreamfinder";
const manualRule = `[General]
Order=steam,custom-rule
rules=

[custom-rule]
Description=Settings for ${devClass}
layer=overlay
layerrule=2
wmclass=${devClass}
wmclassmatch=1
`;

describe("KDE overlay rule setup", () => {
  it("keeps an existing user rule for the development app", () => {
    expect(planKdeOverlayRule(manualRule, devClass)).toBeNull();
  });

  it("adds a separate packaged rule without removing other rules", () => {
    expect(planKdeOverlayRule(manualRule, packagedClass)).toEqual({
      id: "rlstreamfinder-overlay",
      order: "rlstreamfinder-overlay,steam,custom-rule",
      windowClass: packagedClass,
    });
  });

  it("repairs its own incomplete rule without duplicating its order entry", () => {
    const incomplete = `[General]\nOrder=steam,rlstreamfinder-overlay\n\n[rlstreamfinder-overlay]\nwmclass=${packagedClass}\n`;
    expect(planKdeOverlayRule(incomplete, packagedClass)?.order).toBe("rlstreamfinder-overlay,steam");
  });
});
