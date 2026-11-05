cask "helm" do
  version "1.11.1"
  sha256 "e40aa27fa48816db66048499ef2240e8d7fd71c19927d7adbbcfd2dcd46f3cde"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
