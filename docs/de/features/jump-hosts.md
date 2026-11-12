# Jump Hosts (Bastion Server)

Greife auf Server hinter Firewalls über Jump Hosts (Bastion Server) zu.

**<SCREENSHOT: Jump-Host-Konfiguration>**

## Was ist ein Jump Host?

Ein Jump Host (oder Bastion Server) ist ein Zwischen-Server zum Zugriff auf Server, die:

- In einem privaten Netzwerk sind
- Hinter einer Firewall sind
- Nicht direkt vom Internet erreichbar sind

```
Du → Jump Host → Ziel-Server
```

## Basis-Setup

### Schritt 1: Jump Host Verbindung hinzufügen

Erstelle zuerst deine Jump Host Verbindung:

```
Name: Bastion Server
Host: bastion.example.com
Port: 22
Benutzername: jump-user
Auth: SSH-Schlüssel
```

### Schritt 2: Ziel-Server konfigurieren

Beim Hinzufügen des Ziel-Servers, wähle Jump Host:

```
Name: Produktions-Server
Host: 10.0.1.50 (private IP)
Port: 22
Benutzername: admin
Jump Host: → Wähle "Bastion Server"
```

### Schritt 3: Verbinden

Klicke auf **"Verbinden"** beim Produktions-Server.

OwnShell automatisch:

1. Verbindet mit Bastion Server
2. Erstellt Tunnel durch Bastion
3. Verbindet mit Produktions-Server

## AWS VPC Beispiel

**Szenario**: Zugriff auf EC2-Instanz in privatem Subnet.

**Netzwerk-Layout:**

```
Internet → Öffentliches Subnet (Bastion) → Privates Subnet (App Server)
          10.0.1.10                         10.0.2.50
```

**Konfiguration:**

Jump Host (Bastion):

```
Name: AWS Bastion
Host: bastion.aws.example.com
Port: 22
Benutzername: ec2-user
SSH-Schlüssel: aws-key.pem
```

Ziel (App Server):

```
Name: App Server
Host: 10.0.2.50
Port: 22
Benutzername: ec2-user
SSH-Schlüssel: aws-key.pem
Jump Host: AWS Bastion
```

## Best Practices

✅ **MACHE:**

- Nutze dedizierte Bastion-Server (keine anderen Services)
- Beschränke Bastion-Zugriff auf spezifische IPs
- Aktiviere SSH-Logging auf Bastion
- Nutze SSH-Schlüssel (keine Passwörter)

❌ **MACHE NICHT:**

- Anwendungen auf Bastion-Servern laufen lassen
- Bastion erlauben, ausgehende Internet-Verbindungen herzustellen
- Bastion-Zugangsdaten teilen
