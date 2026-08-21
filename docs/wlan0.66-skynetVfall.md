# wlan0.66 / SSID skynetVfall (VLAN 66)

Lab notes from **21 Aug 2026** on host **bb8**, firewall **nfsensei** (`192.168.20.1`, nfSensei 0.51.173, BCM4345/6 `brcmfmac`).

SSH as before: `ssh -i ~/.ssh/id_ed25519 root@192.168.20.1`.

## Goal

New Wi-Fi subinterface off `wlan0`:

| Item | Value |
|------|--------|
| Interface | `wlan0.66` |
| Parent radio | `wlan0` |
| VLAN ID | `66` |
| Interface description | `skynetVfall` |
| SSID | `skynetVfall` |
| Security | WPA2-PSK |
| Passphrase | `welcome2skynetpizza45` |
| Gateway IP | `192.168.66.1/24` on **`wlan0`** (the AP; was briefly on `wlan0.66`) |
| DHCP pool | `dhcp66` on `wlan0`, `192.168.66.20–200` |

## Result (verified from bb8)

SSID **skynetVfall** is visible on `wlp3s0`:

```text
SSID         BSSID              CHAN  FREQ      SIGNAL  SECURITY
skynetVfall  E4:5F:01:10:E2:54  6     2437 MHz  90–94   WPA2
```

BSSID matches the firewall Wi-Fi MAC (`e4:5f:01:10:e2:54`). Probe/beacon: country US, channel 6, RSN CCMP/PSK.

On the box after commit:

```text
wlan0            UP    type AP    ssid skynetVfall    192.168.66.1/24
wlan0.66@wlan0   UP    (no IPv4; VLAN 66)
hostapd  ... /etc/nfsensei/hostapd-wlan0.conf
dnsmasq  ... /etc/nfsensei/dhcp/production-dnsmasq.conf  (udp/67)
```

`show wifi radios`: `wlan0` enabled, 2.4 GHz, channel 6, width 20.

## What is not possible (hardware / nfSensei)

Putting the **SSID on the VLAN child** `wlan0.66` does **not** beacon.

1. `wlan0` was kernel-present but **unassigned** (`show wifi radios` → no radios detected until it was added to config).
2. Creating `wlan0.66` via `interface vlan 66 --parent wlan0` makes an **802.1Q** device (`wlan0.66@wlan0`), not a virtual AP.
3. hostapd on that VLAN child dies immediately:

   ```text
   Wrote hostapd config: /etc/nfsensei/hostapd-wlan0.66.conf
   hostapd started for wlan0.66
   nl80211: deinit ifname=wlan0.66
   wlan0.66: AP-DISABLED
   hostapd_free_hapd_data: Interface wlan0.66 wasn't started
   ```

   Radio stayed `type managed`, child stayed `LOWERLAYERDOWN`.
4. Pi combo (`brcmfmac` BCM43455) allows **one AP**. It will not run hostapd on an 802.1Q wifi subinterface.

Working split:

- **SSID / AP** lives on parent **`wlan0`** (the radio).
- **VLAN 66** is **`wlan0.66`** (802.1Q on that radio, description `skynetVfall`, `192.168.66.1/24`).

Wi-Fi clients associate to `wlan0`, not to the 802.1Q child. A wired VLAN 66 on `eth0` (`eth0.66`) was **not** created. No DHCP pool and no firewall/NAT rules were added for `192.168.66.0/24`, so seeing the SSID ≠ a working client LAN.

## CLI notes

- `nfsensei-cli -c` is one-shot **Privileged EXEC**. Interface edits need `configure terminal` in the **same process**. Candidate is **in-memory per CLI process** — `commit` before the process exits or the change is gone.
- New interfaces are not created by `interface NAME` alone. Hint from the CLI: add them with `ip address` first, then `interface vlan`.
- `commit reason with spaces` must be quoted (`commit "add wlan0.66"`). Unquoted extra words → `Parse error: Extra positional argument.` The following `write` still persisted in this session.
- `wizard vlan --non-interactive` and `wizard interface --non-interactive` returned parse/wizard errors from `-c` here; the modal interface commands were used instead.

## Steps that worked

Quoted `commit` reasons. Run as a single stdin session:

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.20.1
```

### 1. First attempt (SSID on VLAN child) — failed to beacon

```text
configure terminal
interface wlan0
  description wifi-radio
  no shutdown
  no wireless
exit
interface wlan0.66
  ip address 192.168.66.1/24
  interface vlan 66 --parent wlan0
  description skynetVfall
  wireless mode ap
  wireless country US
  wireless band 2.4ghz
  wireless channel 6
  wireless channel-width 20
  wireless ssid skynetVfall
  wireless security wpa2-psk
  wireless passphrase welcome2skynetpizza45
  no shutdown
exit
commit "add wlan0.66 SSID skynetVfall VLAN 66"
write
```

Config accepted (`can_commit true`). `show wifi` listed the SSID on `wlan0.66`, but hostapd on the VLAN child exited and nothing was on the air.

### 2. Move AP onto the radio — SSID visible

```text
configure terminal
interface wlan0.66
  no wireless
exit
interface wlan0
  description wifi-radio
  wireless mode ap
  wireless country US
  wireless band 2.4ghz
  wireless channel 6
  wireless channel-width 20
  wireless ssid skynetVfall
  wireless security wpa2-psk
  wireless passphrase welcome2skynetpizza45
  no shutdown
exit
commit "move AP SSID skynetVfall onto wlan0 radio"
write
```

Daemon log: `hostapd started for wlan0` then `wlan0: interface state UNINITIALIZED->COUNTRY_UPDATE`. `iw` shows `type AP` / `ssid skynetVfall`.

`192.168.66.1/24` was required to *create* `wlan0.66` in candidate. It was later **moved onto `wlan0`** so SSID clients (who associate to the AP, not the 802.1Q child) can use it as gateway and get DHCP. Third octet matches VLAN 10/20 lab numbering.

## Confirm from bb8

```bash
nmcli device wifi rescan ifname wlp3s0
nmcli -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY device wifi list ifname wlp3s0 | grep -i skynet
```

Expected: `skynetVfall` / `E4:5F:01:10:E2:54` / channel 6 / WPA2.

On the firewall:

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.20.1 \
  '/usr/local/bin/nfsensei-cli -c "show wifi"; iw dev wlan0 info; ip -br addr show wlan0.66'
```

## DHCP pool `dhcp66` (SSID skynetVfall)

Wi-Fi clients sit on **`wlan0`**, not on `wlan0.66`. A pool bound to the VLAN child would never see DISCOVERs. Gateway IP was moved to the radio, then a pool was added to match `dhcp20`:

| Item | Value |
|------|--------|
| Pool name | `dhcp66` |
| Listen interface | `wlan0` |
| Network | `192.168.66.0/24` |
| Range | `192.168.66.20` – `192.168.66.200` |
| Gateway | `192.168.66.1` |
| DNS | `8.8.8.8`, `8.8.4.4` |
| Lease | 86400 s |

```text
configure terminal
interface wlan0.66
  no ip address 192.168.66.1/24
exit
interface wlan0
  ip address 192.168.66.1/24
  interface capability add dhcp-server
  no shutdown
exit
dhcp pool add dhcp66 wlan0 192.168.66.0/24 192.168.66.20 192.168.66.200 --gateway 192.168.66.1 --dns 8.8.8.8,8.8.4.4 --lease-time 86400
commit "DHCP pool dhcp66 for SSID skynetVfall"
write
```

That writes the **pool** into config (`show dhcp pools` lists `dhcp66` enabled) but **does not start dnsmasq**. Global `dhcp.enabled` was `false`; every commit logged `Stopping DHCP server`. `service apply dhcp` is retired. There is no `dhcp enable` command.

Enabled the service by loading a patched running-config (only this key changed):

```bash
# on the firewall; keep the !wpa2-psk tag intact (do not round-trip through PyYAML)
python3 -c '
from pathlib import Path
import re
src = Path("/etc/nfsensei/running.yaml").read_text()
new, n = re.subn(r"(?m)^dhcp:\n  enabled: false", "dhcp:\n  enabled: true", src, count=1)
assert n == 1
Path("/tmp/nfsensei-dhcp-enabled.yaml").write_text(new)
'
# then in nfsensei-cli:
configure terminal
config load /tmp/nfsensei-dhcp-enabled.yaml
commit "enable DHCP service"
write
```

After that:

```text
✓ DHCP server input rule applied for wlan0
✓ DHCP server configured and started
dnsmasq ... --conf-file=/etc/nfsensei/dhcp/production-dnsmasq.conf
udp/67 on 0.0.0.0
```

Generated snippet:

```text
interface=wlan0
dhcp-range=set:pool-1-dhcp66,192.168.66.20,192.168.66.200,1d
dhcp-option=tag:pool-1-dhcp66,option:router,192.168.66.1
dhcp-option=tag:pool-1-dhcp66,6,8.8.8.8,8.8.4.4
```

**Side effect:** turning `dhcp.enabled` on also started the existing **`dhcp20`** pool on `eth0.20` (`192.168.20.20–200`). bb8’s static `192.168.20.50` sits inside that range.

SSID still visible from bb8 after this: `skynetVfall` / `E4:5F:01:10:E2:54` / ch 6 / WPA2 / signal ~94.

No firewall forward/NAT for `192.168.66.0/24` yet (same as VLAN 20). Clients should get a lease and reach `192.168.66.1`; internet via WAN is not granted.

## Generated hostapd

`/etc/nfsensei/hostapd-wlan0.conf` (daemon-generated, do not edit):

- `interface=wlan0`, `driver=nl80211`
- `country_code=US`, `hw_mode=g`, `ieee80211n=1`, `channel=6`
- `ssid=skynetVfall`, `wpa=2`, `wpa_key_mgmt=WPA-PSK`, `rsn_pairwise=CCMP`

## Commits on the box

| commit_id | what |
|-----------|------|
| `1338-1407-9e0ea7d5` | first write: `wlan0` + `wlan0.66` VLAN + AP attempted on child |
| `1397-1407-1fa6bdc8` | AP/SSID moved to `wlan0`; `wlan0.66` remains VLAN 66 |
| `1820-1407-d27359ad` / `1823-1407-4dbe73cb` | `dhcp66` pool + `192.168.66.1/24` moved to `wlan0` |
| `1875-1407-ee123d8e` / `1878-1407-5e05022c` | `dhcp.enabled: true` — dnsmasq started |

## Left undone

- Firewall / NAT for `192.168.66.0/24` (clients will not reach the internet yet)
- `eth0.66` trunk on the wired NIC
- Bridging AP STA traffic into VLAN 66 (clients on the SSID are on `wlan0`, not on the 802.1Q child)

This repo is public; the PSK is in this file because it was part of the lab request. Rotate it if that is a problem.
