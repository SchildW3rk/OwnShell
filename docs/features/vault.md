# Vault & environments

<!-- v-pre: {{…}} in this page is OwnShell variable syntax, not Vue interpolation -->
:::: v-pre

The **Vault** has three tabs: **Credentials**, **Environments** and **SSH Keys** (see [SSH keys](/features/ssh#ssh-keys)).

![Vault with environments and variables](/screenshots/vault.png)

## Credentials

Store logins with title, username, password, URL, notes, tags and a favorite flag. **Only the password is encrypted**; title, username, URL, notes and tags are stored in plain text in the local database, so keep secrets out of them. **Open URL** opens http/https links in your browser.

## Environments

An environment is a named set of variables, for example `shop-production`. It has a name, an optional project label and description, the variables, and optionally a host and default remote path for uploads.

- Each variable value is encrypted with your master password.
- Edit variables one by one, or switch to the **bulk editor** and paste a complete `.env` file. The bulk editor understands `#` comments, blank lines, quoted values and multi-line values in double quotes.
- Environments are available as variables in the [API client](/features/api-client#variables): select one per request and use `{{KEY}}`.

### Upload a .env file to a server

Choose **Deploy to SFTP** on an environment to write it to a server over SFTP:

1. Set the target host on the environment.
2. Enter the remote path, for example `/srv/shop/.env`.
3. OwnShell connects (using the host's saved credentials and jump host), creates the parent folder if needed and writes the file.

The file is written with permissions **0600** (owner read/write only), also when it replaces an existing file. The time of the last upload is shown on the environment.

::: warning Format
The file has one `KEY=VALUE` line per variable, in the format Docker Compose reads (`.env` and `env_file`):

- Names must start with a letter or `_` and contain only letters, digits and `_`. Otherwise the upload is refused.
- Values made only of letters, digits and `_ . / : @ , + -` are written unquoted.
- All other values are written in double quotes with `\\`, `\"` and `\$` escaped and line breaks as `\n`, so `#`, spaces, quotes and `$` reach your application unchanged (no variable interpolation).

An existing file is replaced, not backed up.
:::

OwnShell does not inject environment variables into terminal sessions.

## Encryption

Vault secrets are encrypted with AES-256-GCM using a key derived from your master password (see [Install & first launch](/getting-started#how-your-data-is-protected)). The vault locks together with the app.

::::
