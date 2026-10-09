# Assinatura e notarização no macOS

Sem notarização, o macOS mostra _"A Apple não pôde verificar se o Clawos está livre de malware"_ quando o app é baixado pelo navegador. O projeto já está configurado para assinar com **Developer ID** e **notarizar** automaticamente no workflow de release — basta fornecer as credenciais. Sem elas, o build continua saindo com assinatura ad-hoc (como hoje).

## O que você precisa

1. **Apple Developer Program** (US$ 99/ano) em <https://developer.apple.com/programs/>.
2. Um certificado **Developer ID Application**:
   - Xcode → Settings → Accounts → (sua conta) → Manage Certificates → **+** → _Developer ID Application_; ou pelo portal developer.apple.com → Certificates.
   - No app **Acesso às Chaves**, exporte o certificado **com a chave privada** como `.p12` e defina uma senha.
3. Uma **senha de app** do Apple ID em <https://account.apple.com> → Entrar e Segurança → Senhas de app.
4. O seu **Team ID** (10 caracteres) em <https://developer.apple.com/account> → Membership.

## Secrets no GitHub

Em _Settings → Secrets and variables → Actions_ do repositório, crie:

| Secret                        | Valor                                 |
| ----------------------------- | ------------------------------------- |
| `MAC_CERT_P12_BASE64`         | `base64 -i certificado.p12 \| pbcopy` |
| `MAC_CERT_PASSWORD`           | senha do `.p12`                       |
| `APPLE_ID`                    | e-mail do Apple ID                    |
| `APPLE_APP_SPECIFIC_PASSWORD` | a senha de app                        |
| `APPLE_TEAM_ID`               | o Team ID                             |

Na próxima tag (`git tag vX.Y.Z && git push origin vX.Y.Z`), o job de macOS assina com Hardened Runtime (entitlements em `build/entitlements.mac.plist`), envia para a Apple e grampeia o ticket de notarização no `.dmg`/`.zip`. O app passa a abrir sem nenhum aviso.

## Localmente

```bash
pnpm dist:mac          # ad-hoc (sem certificado)
pnpm dist:mac:signed   # usa o Developer ID do seu Acesso às Chaves; notariza se APPLE_ID,
                       # APPLE_APP_SPECIFIC_PASSWORD e APPLE_TEAM_ID estiverem no ambiente
```

## Enquanto não houver notarização

- Instalação pelo Terminal (o `curl` não aplica a quarentena): `curl -fsSL https://<site>/install.sh | bash`.
- Ou, depois de abrir o `.dmg`: Ajustes do Sistema → Privacidade e Segurança → **Abrir Mesmo Assim** (macOS 15+), ou `xattr -dr com.apple.quarantine /Applications/Clawos.app`.
