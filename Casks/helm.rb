cask "helm" do
  version "1.10.0"
  sha256 "54ff9e7d82debc37aafd63246f7943156c3f28caf0b9d6f320ab7ddafece36ef"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
