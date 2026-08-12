cask "helm" do
  version "1.0.0"
  sha256 "0c4e3d49cee04d89ff5959bb36a4c76d4af88ce58e6e3401d31c788ad62747fa"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: ">= :big_sur"
  app "Helm.app"
end
