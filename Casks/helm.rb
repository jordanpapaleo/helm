cask "helm" do
  version "1.6.1"
  sha256 "f144b7e5732d506c299b6ec7a2207e617cf4406662a1c6c22125c4c825ffdf58"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
