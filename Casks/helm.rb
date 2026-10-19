cask "helm" do
  version "1.5.0"
  sha256 "7c7988786af62edff03f9a002809df28a32e8d14dc034fe0ea1d0c3b02a8db61"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
