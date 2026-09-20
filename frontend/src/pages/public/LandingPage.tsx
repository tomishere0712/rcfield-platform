import { AndroidAppDownloadSection } from "./components/landing/AndroidAppDownloadSection"
import { FeaturedVenuesSection } from "./components/landing/FeaturedVenuesSection"
import { HomeHeroSection } from "./components/landing/HomeHeroSection"
import { HomePartnerTeaser } from "./components/landing/HomePartnerTeaser"
import { HowItWorksSection } from "./components/landing/HowItWorksSection"

export function LandingPage() {
  return (
    <>
      <HomeHeroSection />
      <HowItWorksSection />
      <FeaturedVenuesSection />
      <AndroidAppDownloadSection />
      <HomePartnerTeaser />
    </>
  )
}
