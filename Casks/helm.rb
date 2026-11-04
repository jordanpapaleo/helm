cask "helm" do
  version "1.10.2"
  sha256 "78fffca72944e8080c927d4c40cf8883ef9f7d08b62df301c32c6af5ddf54930"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
