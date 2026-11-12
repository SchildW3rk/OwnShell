# Jump Hosts (Bastion Servers)

Access servers behind firewalls using jump hosts (bastion servers).

**<SCREENSHOT: Jump host configuration>**

## What is a Jump Host?

A jump host (or bastion server) is an intermediate server used to access other servers that are:

- On a private network
- Behind a firewall
- Not directly accessible from internet

```
You → Jump Host → Target Server
```

## Basic Setup

### Step 1: Add Jump Host Connection

Create your jump host connection first:

**<SCREENSHOT: Add jump host>**

```
Name: Bastion Server
Host: bastion.example.com
Port: 22
Username: jump-user
Auth: SSH Key
```

### Step 2: Configure Target Server

When adding target server, select jump host:

**<SCREENSHOT: Target server with jump host>**

```
Name: Production Server
Host: 10.0.1.50 (private IP)
Port: 22
Username: admin
Jump Host: → Select "Bastion Server"
```

### Step 3: Connect

Click **"Connect"** on Production Server.

OwnShell automatically:

1. Connects to Bastion Server
2. Creates tunnel through bastion
3. Connects to Production Server

**<SCREENSHOT: Connected through jump host>**

## Multi-Hop Jump Hosts

For ultra-secure networks with multiple layers:

```
You → Jump 1 → Jump 2 → Target
```

**<SCREENSHOT: Multi-hop configuration>**

Example:

```
Target Server
  └─ Jump Host: DMZ Server
      └─ Jump Host: External Bastion
```

## AWS VPC Example

**Scenario**: Access EC2 instance in private subnet.

**Network Layout:**

```
Internet → Public Subnet (Bastion) → Private Subnet (App Server)
          10.0.1.10                  10.0.2.50
```

**Configuration:**

Jump Host (Bastion):

```
Name: AWS Bastion
Host: bastion.aws.example.com
Port: 22
Username: ec2-user
SSH Key: aws-key.pem
```

Target (App Server):

```
Name: App Server
Host: 10.0.2.50
Port: 22
Username: ec2-user
SSH Key: aws-key.pem
Jump Host: AWS Bastion
```

## Jump Host with Different Authentication

Jump and target servers can use different authentication:

**<SCREENSHOT: Different auth methods>**

Example:

```
Bastion: Password authentication
Target: SSH key authentication
```

OwnShell handles both seamlessly!

## Port Forwarding Through Jump Hosts

You can create tunnels through jump hosts:

**<SCREENSHOT: Tunnel through jump host>**

Example: Access database on private server

```
Jump: bastion.example.com
Target: private-db-server (10.0.2.100)
Tunnel: Local 3306 → Target localhost:3306
```

Now `localhost:3306` connects to database on private server!

## Best Practices

✅ **DO:**

- Use dedicated bastion servers (no other services)
- Restrict bastion access to specific IPs
- Enable SSH logging on bastion
- Use SSH keys (not passwords)
- Keep bastion OS updated

❌ **DON'T:**

- Run applications on bastion servers
- Allow bastion to connect outbound to internet
- Share bastion credentials
- Forget to monitor bastion logs

## Security Hardening

### Bastion Server SSH Config

Edit `/etc/ssh/sshd_config`:

```bash
# Disable password auth
PasswordAuthentication no
PubkeyAuthentication yes

# Disable root login
PermitRootLogin no

# Limit max sessions
MaxSessions 10

# Enable logging
LogLevel VERBOSE

# Restrict users
AllowUsers jump-user admin-user

# Disable forwarding if not needed
AllowTcpForwarding yes
X11Forwarding no
```

Restart SSH:

```bash
sudo systemctl restart sshd
```

### IP Whitelisting

Only allow connections from known IPs:

```bash
# /etc/hosts.allow
sshd: 203.0.113.0/24
sshd: 198.51.100.50

# /etc/hosts.deny
sshd: ALL
```

## Troubleshooting

### Connection Through Jump Host Fails

1. **Test jump host connection separately:**

   ```bash
   ssh jump-user@bastion.example.com
   ```

2. **From jump host, test target:**

   ```bash
   ssh admin@10.0.2.50
   ```

3. **Check firewall rules** on jump host:
   ```bash
   sudo iptables -L
   ```

### Slow Connection Through Jump

Jump hosts add latency. For faster access:

- Use jump hosts in same region as targets
- Minimize number of hops
- Enable compression in SSH settings

### Cannot Access Private IP

Ensure jump host has route to private network:

```bash
# On jump host
ip route show
ping 10.0.2.50
```

For more help, see the [FAQ](/faq).
