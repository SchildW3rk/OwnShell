# SSH Tunneling & Port Forwarding

Erstelle sichere Tunnel, um auf Remote-Services über verschlüsselte SSH-Kanäle zuzugreifen.

**<SCREENSHOT: Tunnel-Liste>**

## Tunnel-Typen

### Lokales Port Forwarding

Leite einen lokalen Port zu einem Remote-Service weiter.

**Beispiel: Zugriff auf Remote-Datenbank**

```
Lokaler Port: 3306
Remote-Host: localhost
Remote-Port: 3306
```

Jetzt verbindet `localhost:3306` auf deinem Rechner mit der Remote-Datenbank!

```bash
mysql -h localhost -P 3306 -u user -p
```

### Remote Port Forwarding

Leite einen Remote-Port zu deinem lokalen Service weiter.

**Beispiel: Lokalen Webserver exposieren**

```
Remote-Port: 8080
Lokaler Host: localhost
Lokaler Port: 3000
```

### Dynamic Port Forwarding (SOCKS Proxy)

Erstelle einen SOCKS-Proxy über den SSH-Server.

```
Lokaler Port: 1080
```

Konfiguriere deinen Browser, `localhost:1080` als SOCKS5-Proxy zu nutzen.

## Tunnel erstellen

1. Öffne **Tunnels**-Tab
2. Klicke auf **"Neuer Tunnel"**
3. Wähle Typ (Local/Remote/Dynamic)
4. Gib Ports und Hosts ein
5. Klicke auf **"Start"**

### Auto-Start Tunnel

Aktiviere **"Auto-Start bei Verbindung"**, um Tunnel automatisch beim Server-Connect zu erstellen.

Perfekt für häufig genutzte Tunnel wie Datenbanken.

## Praktische Beispiele

### Beispiel: Remote MySQL zugreifen

MySQL erlaubt nur localhost-Verbindungen:

```
Typ: Local Forward
Lokaler Port: 3307
Remote-Host: localhost
Remote-Port: 3306
```

Verbinde mit:

```bash
mysql -h 127.0.0.1 -P 3307 -u user -p
```

## Best Practices

✅ **MACHE:**

- Nutze hohe Ports (>1024) für lokales Forwarding
- Speichere häufig genutzte Tunnel-Konfigurationen
- Aktiviere Auto-Start für Datenbank-Tunnel

❌ **MACHE NICHT:**

- Produktions-Datenbanken öffentlich exposieren
- Standard-Ports nutzen (Konflikte wahrscheinlich)
- Tunnel vergessen zu stoppen (Sicherheitsrisiko)
