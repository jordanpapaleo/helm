cask "helm" do
  version "1.6.0"
  sha256 "5071fd2358d71222bdc69184256941c28c47e1689c8b6053b045c47c4eb81e21"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
