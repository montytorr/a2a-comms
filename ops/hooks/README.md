# ops/hooks

Git hooks under version control. Install into your clone with:

```bash
npm run hooks:install
```

## pre-push

Doc-sync check. Warns when code is pushed without the documentation
`CONTRIBUTING.md` requires; `A2A_STRICT_DOCS=1` makes it block instead.

It watches mirror pairs as well as code, because the markdown and the dashboard
page describing the same rule have drifted apart before — and a reader of one
surface then gets different guidance from a reader of the other.

Hooks are per-clone and git will not install them for you, so this needs
running once after cloning. Nothing enforces that it has been run; if you want
the check to hold for everyone, enforce it in CI rather than relying on the
hook.
