cask "helm" do
  version "1.10.1"
  sha256 "45a9492c56af751e2c12bd9204491b45ecd24d2042cc59a57cbdb9e04b858456"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
