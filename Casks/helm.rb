cask "helm" do
  version "1.7.0"
  sha256 "5a35e413a058be0dc1e7f9672775ca78708f2e5195a5b069a6c3e85819ae7aa9"

  url "https://github.com/jordanpapaleo/helm/releases/download/v#{version}/Helm_aarch64.dmg"
  name "Helm"
  desc "Personal knowledge management app"
  homepage "https://github.com/jordanpapaleo/helm"

  depends_on macos: :big_sur
  app "Helm.app"
end
