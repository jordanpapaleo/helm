cask "helm" do
  version "1.12.2"
  sha256 "428b328f3f6a76a26bfc9de69b78b6b90f1082fb5b13bec1c319889043808f2f"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
