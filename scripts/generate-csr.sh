#!/bin/bash
set -e

# Generate a private key and CSR for the Notify vanity domain,
# including Subject Alternative Names (SANs).
#
# Usage:
#   ./generate-csr.sh                                   # default domain and SANs
#   ./generate-csr.sh notify.digital.gov.bc.ca          # override the common name
#   SANS="api.notify.digital.gov.bc.ca" ./generate-csr.sh   # override the SAN list
#
# Submit the resulting .csr to the BC Gov certificate service. The .key stays on
# the machine that generated it — never commit it (*.key is gitignored) and
# never send it with the CSR.

# The certificate's common name. Everything else is derived from it.
PRIMARY_DOMAIN="${1:-notify.digital.gov.bc.ca}"

# Extra hostnames the certificate must also cover, space-separated. The primary
# domain does not need listing here: it is added to the SANs automatically,
# because browsers ignore a common name that is not also a SAN.
#
# The defaults are the dev and test environment hostnames; the primary domain
# is production.
SANS="${SANS:-dev.notify.digital.gov.bc.ca test.notify.digital.gov.bc.ca}"

# Build the alt_names block, numbering as it goes and skipping duplicates so
# passing the primary domain in SANS can't produce an invalid config.
ALT_NAMES=""
INDEX=1
SEEN=""
for DOMAIN in $PRIMARY_DOMAIN $SANS; do
  case " $SEEN " in
    *" $DOMAIN "*) continue ;;
  esac
  SEEN="$SEEN $DOMAIN"
  ALT_NAMES="${ALT_NAMES}DNS.${INDEX} = ${DOMAIN}"$'\n'
  INDEX=$((INDEX + 1))
done

# The config goes to a temp file rather than a process substitution: the
# apostrophe in "Citizens' Services" opens a quote the shell never closes when
# the heredoc is parsed inside <( ), and the heredoc has to stay unquoted so the
# domain variables expand.
CONFIG_FILE="$(mktemp)"
trap 'rm -f "$CONFIG_FILE"' EXIT

cat > "$CONFIG_FILE" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = CA
ST = British Columbia
L = Victoria
O = Government of the Province of British Columbia
# Double-quoted so OpenSSL keeps the apostrophe: unquoted, it treats ' as a
# quote character and the OU silently becomes "Citizens Services".
OU = "Citizens' Services"
CN = ${PRIMARY_DOMAIN}

[req_ext]
subjectAltName = @alt_names

[alt_names]
${ALT_NAMES}
EOF

openssl req -new -sha256 -nodes \
  -out "${PRIMARY_DOMAIN}.csr" \
  -newkey rsa:2048 \
  -keyout "${PRIMARY_DOMAIN}.key" \
  -config "$CONFIG_FILE"

# Restrict private key permissions
chmod 600 "${PRIMARY_DOMAIN}.key"

# Display CSR details for verification
openssl req -in "${PRIMARY_DOMAIN}.csr" -noout -text
