cask "helm" do
  version "1.2.0"
  sha256 "745d6d644be26a5babb10fc8905b577a973b6bf177a2ec4129ddbfe3f56e3e21"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
