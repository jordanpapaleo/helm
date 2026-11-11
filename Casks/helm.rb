cask "helm" do
  version "1.12.0"
  sha256 "cdc5282d81b393f4d39a93c10b73f6366a71cfc52628d6d4fb98fcb16ffb7f7b"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
