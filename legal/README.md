# legal

`privacy.html` is the privacy policy the Chrome Web Store listing points at. It is hosted
as a single public object on S3:

    https://website-blocker-extension.s3.us-east-1.amazonaws.com/privacy.html

`bucket-policy.json` is the policy applied to that bucket. It grants anonymous
`s3:GetObject` on exactly that one key; the bucket is not listable and no other object is
readable.

There is deliberately no deny-non-TLS rule. The usual reason for one is confidentiality or
integrity of something worth intercepting, and this is a public document whose entire
content is already world-readable. The URL given to the Web Store is `https://`, so that is
what anyone actually follows. Blocking plain HTTP would buy a defence against an attacker
who can already MITM the connection but only wants to reword a privacy policy — which is
not a threat worth a rule that can fail closed later.

    aws s3api put-bucket-policy --bucket website-blocker-extension \
      --policy file://legal/bucket-policy.json
    aws s3 cp legal/privacy.html s3://website-blocker-extension/privacy.html \
      --content-type text/html

**The hosted copy and this file must agree.** A store listing pointing at a policy that
contradicts the repository is worse than having no policy in the repository at all, so
re-upload whenever this file changes.
