cask "helm" do
  version "1.12.1"
  sha256 "b9888e39e237d86a8f1f4df27faf7aebf024cef9a0316a98f647f97cfba7e57d"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
