cask "helm" do
  version "1.9.0"
  sha256 "93225ef96d25de8d5f72d8f66b94834872f18009c4e5a2bb9810114905f4a79c"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
