cask "helm" do
  version "1.8.0"
  sha256 "2712d35ac8238199e31effc1905d3b6cc75813e2faf7c7f6d61b90e5b535e0cc"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
