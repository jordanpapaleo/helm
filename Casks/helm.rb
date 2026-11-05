cask "helm" do
  version "1.11.0"
  sha256 "de9b16cf20b2b8e1348aae2eaa6f7b65f9f1cda9a8f437359fba7c970956fade"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
