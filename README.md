# nfSensei admin access (bb8)

Lab notes for reaching and administering the **nfSensei** firewall from host **bb8** (Ubuntu). Covers the VLAN 20 path, factory SSH login, the `neon@bb8` key, and a searchable CLI reference dumped from `help` on the box.

Related host-side VLAN 10 work lives in [KiryuCode/nfsensei-vlans](https://github.com/KiryuCode/nfsensei-vlans).

## Config backups

Running-config YAML lives in [`backups/`](backups/). Latest: [`backups/nfsensei-running-2026-08-21.yaml`](backups/nfsensei-running-2026-08-21.yaml) (`config save --running` from the box). Restore notes in [`backups/README.md`](backups/README.md).

## Searchable CLI (web GUI)

Open [`web/index.html`](web/index.html) in a browser, or serve it:

```bash
cd web
python3 -m http.server 8080
# then http://127.0.0.1:8080/
```

- Type `/` to focus search.
- Queries like **add ip**, **vlan**, **dhcp**, **allow ssh**, **commit** hit how-to recipes first.
- **Top 20** most useful commands sit above the full catalog (883 commands from nfSensei 0.51.173).
- Every command has usage plus a lab-shaped example (`eth0.20` / `192.168.20.0/24`).

Raw dumps: [`docs/cli-help.txt`](docs/cli-help.txt) (table) and [`docs/cli-help-detail.txt`](docs/cli-help-detail.txt) (`help <command>` for each).

Refresh from the firewall:

```bash
ssh root@192.168.20.1 '/usr/local/bin/nfsensei-cli -c help'
ssh root@192.168.20.1 '/usr/local/bin/nfsensei-cli -c "help ip address"'
```

## Working config

| Item | Value |
|------|--------|
| Host | bb8 (`neon`) |
| Parent NIC | `enp5s0` |
| VLAN interface | `VLAN20@enp5s0` |
| VLAN ID | `20` |
| Host address | `192.168.20.50/24` (static) |
| Firewall | `192.168.20.1` |
| Firewall MAC | `e4:5f:01:10:e2:53` (Raspberry Pi Trading Ltd) |
| Firewall hostname | `nfsensei` |
| OS | `Linux nfsensei 7.0.14-nfsensei+` aarch64 |
| SSH | TCP 22, password + publickey + keyboard-interactive |
| Web | Caddy on 443 (self-signed) |

The switch port for `enp5s0` must trunk VLAN 20 tagged.

`nfsensei` is the **hostname**, not an SSH user. Login as `root`.

## SSH

### Factory default

Published nfSensei factory credentials (same as the web UI):

| | |
|---|---|
| Username | `root` |
| Password | `nfSensei` (capital `S`) |

```bash
ssh root@192.168.20.1
```

These failed (no such login / wrong password):

```text
nfsensei@192.168.20.1   # hostname is not a user
admin / nfSensei
nfsensei / nfSensei
nfsensei / nfsensei
nfsensei / pfsense
```

Change the factory password. Key auth is now the intended path from this host.

### Key installed on the firewall

This public key was appended to `/root/.ssh/authorized_keys` (permissions `700` on `.ssh`, `600` on the file):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJsal0OiSkwCsBkQ0dl7j5701XWZFPnnrl6okhc+rsb1 neon@bb8
```

It matches `~/.ssh/id_ed25519.pub` on bb8. Passwordless login from this host:

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.20.1
```

Verified:

```text
KEY_LOGIN_OK
nfsensei
root
```

### Add another key

```bash
KEY='ssh-ed25519 AAAA... comment'
ssh root@192.168.20.1 "mkdir -p /root/.ssh && chmod 700 /root/.ssh &&
  touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys &&
  grep -Fqx \"\$KEY\" /root/.ssh/authorized_keys || printf '%s\n' \"\$KEY\" >> /root/.ssh/authorized_keys"
```

Or, already on the box:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
echo 'ssh-ed25519 AAAA... comment' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

## Host path (VLAN 20)

NetworkManager connection `VLAN20`:

```text
connection.type:     vlan
vlan.parent:         enp5s0
vlan.id:             20
vlan.flags:          1 (REORDER_HEADERS)
ipv4.method:         manual
ipv4.addresses:      192.168.20.50/24
ipv4.never-default:  no
ipv4.routes:         0.0.0.0/0 via 192.168.20.1 metric 50
ipv6.method:         disabled   # if set
```

Create or update:

```bash
sudo nmcli connection add type vlan con-name VLAN20 ifname VLAN20 \
  dev enp5s0 id 20 \
  ipv4.method manual \
  ipv4.addresses 192.168.20.50/24 \
  ipv4.routes '0.0.0.0/0 192.168.20.1 50' \
  ipv4.never-default no \
  ipv6.method disabled \
  connection.autoconnect yes \
  connection.autoconnect-priority 150

sudo nmcli connection up VLAN20
```

If the connection already exists, `nmcli connection modify VLAN20 ...` then `nmcli connection up VLAN20`.

## Verify

```bash
ip -br addr show VLAN20
ip route get 192.168.20.1
ping -I VLAN20 -c 4 192.168.20.1
ip neigh show dev VLAN20

timeout 5 bash -c 'echo >/dev/tcp/192.168.20.1/22' && echo 'port 22 open'

ssh -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 \
  root@192.168.20.1 'echo LOGIN_OK; hostname; id; uname -a; uptime'
```

Expected:

```text
VLAN20@enp5s0    UP             192.168.20.50/24
192.168.20.1 dev VLAN20 src 192.168.20.50
64 bytes from 192.168.20.1: icmp_seq=1 ttl=64 ...
192.168.20.1 dev VLAN20 lladdr e4:5f:01:10:e2:53 REACHABLE
port 22 open
LOGIN_OK
nfsensei
uid=0(root) ...
Linux nfsensei 7.0.14-nfsensei+ #1 SMP PREEMPT Tue Aug  4 14:44:43 UTC 2026 aarch64 Linux
```

A successful SSH session looks like:

```text
uid=0(root) gid=0(root) groups=0(root),1(bin),2(daemon),3(sys),4(adm),6(disk),10(wheel),11(floppy),20(dialout),26(tape),27(video)
```

Too many failed password attempts can reset the SSH handshake (`kex_exchange_identification: Connection reset by peer`). Wait a few seconds and retry.

## Wi-Fi AP + VLAN 66 (`skynetVfall`)

SSID **skynetVfall** is up on the firewall radio (`wlan0`, 2.4 GHz channel 6, WPA2-PSK). VLAN **66** is `wlan0.66`. Gateway **`192.168.66.1/24`** and DHCP pool **`dhcp66`** (`192.168.66.20–200`) listen on **`wlan0`** (SSID clients associate there, not on the 802.1Q child). Full CLI transcript: [`docs/wlan0.66-skynetVfall.md`](docs/wlan0.66-skynetVfall.md).

Confirmed from this host (`wlp3s0`): BSSID `E4:5F:01:10:E2:54`, signal ~90–94. `dnsmasq` is serving udp/67. Global DHCP enable also started the existing `dhcp20` pool on `eth0.20`.

Internet: `wifi66-to-any` (pass `192.168.66.0/24` on `wlan0` / `wlan0.66`) and `wifi66-masquerade` (SNAT out `eth0`). STA `192.168.66.183` has ESTABLISHED sessions NATed to `192.168.4.48`.

## Web UI

HTTPS is served by **Caddy**. From this host, `https://192.168.20.1/` currently 301-loops to `https://192.168.20.1:443/`. HTTP/80 was not answering when probed. Console login on the box still prints the GUI URL and factory user/password.

## What was confirmed (21 Aug 2026)

1. `192.168.20.1` is on-link via `VLAN20`, ICMP ~0.2–0.4 ms, SSH port open.
2. `ssh nfsensei@192.168.20.1` is the wrong username.
3. `ssh root@192.168.20.1` with password `nfSensei` works (factory default still set).
4. Hostname is `nfsensei`; kernel `7.0.14-nfsensei+` aarch64; uptime was ~8 hours at last check.
5. `neon@bb8` ed25519 public key is in `/root/.ssh/authorized_keys`.
6. Key login from bb8 with `~/.ssh/id_ed25519` works (`KEY_LOGIN_OK`).

## Related

- [KiryuCode/nfsensei-vlans](https://github.com/KiryuCode/nfsensei-vlans) — VLAN 10 (`192.168.10.50/24` → `192.168.10.1`) bring-up on the same parent NIC.
- [nfSensei blog](https://blog.nfsensei.org/) — product notes. Factory login `root` / `nfSensei` is also documented in third-party beta write-ups.
