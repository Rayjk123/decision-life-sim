#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
stack=maple-hollow-pixel-town
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region)}}"
: "${region:?Set AWS_REGION}"
build=$(mktemp -d)
account=$(aws sts get-caller-identity --query Account --output text --region "$region")
bucket="dls-maple-hollow-$account-$region"
if ! aws s3api head-bucket --bucket "$bucket" --region "$region" 2>/dev/null; then
  location=()
  if [[ "$region" != us-east-1 ]]; then location=(--create-bucket-configuration "LocationConstraint=$region"); fi
  aws s3api create-bucket --bucket "$bucket" --region "$region" "${location[@]}"
fi
aws s3api put-public-access-block --bucket "$bucket" --region "$region" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
./node_modules/.bin/esbuild packages/town/src/server.ts --bundle --platform=node --target=node22 --format=esm --outfile="$build/server.mjs"
(cd "$build" && zip -q town.zip server.mjs)
key="town/$(shasum -a 256 "$build/town.zip" | cut -d' ' -f1).zip"
aws s3 cp "$build/town.zip" "s3://$bucket/$key" --region "$region" --only-show-errors
aws cloudformation deploy --stack-name "$stack" --region "$region" \
  --template-file packages/town/deploy/stack.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides "ArtifactBucket=$bucket" "ArtifactKey=$key" --no-fail-on-empty-changeset
output() {
  aws cloudformation describe-stacks --stack-name "$stack" --region "$region" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}
site=$(output SiteBucket)
distribution=$(output DistributionId)
for asset in index.html town.css town.js audio.js art/street-day.png art/street-evening.png art/bakery.png art/cottage.png art/cottage-day.png art/cast.png art/red-coat-walk.png art/resident-walk.png packages/town/art/work-*.png; do
  asset=${asset#packages/town/}
  aws s3 cp "packages/town/$asset" "s3://$site/$asset" --region "$region" --only-show-errors
done
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' --region "$region" >/dev/null
output TownUrl
