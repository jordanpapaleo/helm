cask "helm" do
  version "1.4.0"
  sha256 "b51f6ad325d5ade416a5ec3c4d760aa878669767c12810e51d491b40252a1b2e"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
