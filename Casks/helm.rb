cask "helm" do
  version "1.3.0"
  sha256 "20bf2c3171a15a046714de0005f1bff5db6e954d7d6c1a76e9e092ce8a6ee522"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
