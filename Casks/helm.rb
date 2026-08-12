cask "helm" do
  version "1.1.0"
  sha256 "ae15749b82c13f0b1b381091ccab4fee73aeb9aaaa96314af826924770da7cc9"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: ">= :big_sur"
  app "Helm.app"
end
