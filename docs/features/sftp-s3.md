# SFTP & S3 Browser

Browse and transfer files via SFTP or S3-compatible storage.

**<SCREENSHOT: Dual-pane file browser>**

## SFTP File Browser

After connecting via SSH, the SFTP browser shows your remote file system.

### Navigation

**<SCREENSHOT: SFTP navigation>**

- **Breadcrumb Path** - Click any folder to jump up
- **Quick Jump** - Type path: `/var/www/html`
- **Bookmarks** - Save frequently used directories

### Large directories and remote editing

SSH Files and standalone File Transfer retain the complete remote listing while rendering only visible rows. Sorting, filtering and selection apply to the full loaded list, including entries outside the viewport. There is no new result cap. SSH Files remains name-sorted initially; standalone transfer initially preserves server order.

Remote editors retain syntax highlighting, undo, selection and viewport state without copying the full document for every key. UTF-8 and lossless Latin-1 contents retain their encoding through save.

### File Operations

#### Upload Files

**<SCREENSHOT: Upload dialog>**

1. Click **"Upload"** button
2. Select files from your computer
3. Files transfer with progress bar

#### Download Files

1. Select files/folders
2. Right-click → **"Download"**
3. Choose destination on your computer

#### Drag & Drop

**<SCREENSHOT: Drag and drop transfer>**

Simply drag files from your desktop into OwnShell to upload!

### Permissions Management

**<SCREENSHOT: Change permissions dialog>**

Right-click any file → **"Permissions"**:

- **Owner** - Read, Write, Execute
- **Group** - Read, Write, Execute
- **Others** - Read, Write, Execute

Common permission patterns:

- **755** - rwxr-xr-x (directories)
- **644** - rw-r--r-- (files)
- **600** - rw------- (sensitive files)

### Creating Files & Folders

- **New Folder** - Right-click → **"New Folder"**
- **New File** - Right-click → **"New File"**
- **Rename** - Right-click → **"Rename"**
- **Delete** - Right-click → **"Delete"** (⚠️ permanent!)

## S3 Browser

Connect to AWS S3, MinIO, or any S3-compatible storage.

**<SCREENSHOT: S3 browser>**

### Connecting to S3

1. Open **S3** tab
2. Click **"New Connection"**
3. Enter details:

```
Service: AWS S3
Endpoint: s3.amazonaws.com
Region: us-east-1
Access Key: AKIA...
Secret Key: ••••••••
```

For MinIO or custom S3:

```
Service: MinIO
Endpoint: minio.example.com:9000
Access Key: minioadmin
Secret Key: ••••••••
```

### Browsing Buckets

**<SCREENSHOT: S3 bucket list>**

- View all accessible buckets
- Click bucket to browse objects
- Navigate prefixes using folder rows and breadcrumbs

For truncated listings, **Load more** appends the next continuation-token page in its existing order without imposing a total-object limit. Selection applies to the complete loaded list. A prefix change retires the previous view's pending responses.

Object counts and loading/retry/pagination controls follow the selected English or German application language.

### Uploading to S3

**<SCREENSHOT: S3 upload>**

1. Navigate to desired bucket/folder
2. Click **"Upload"**
3. Select files
4. Choose storage class:
   - **Standard** - Frequent access
   - **Intelligent-Tiering** - Auto-optimize
   - **Glacier** - Archive storage

### Presigned URLs

**<SCREENSHOT: Generate presigned URL>**

Generate temporary download links:

1. Right-click object → **"Share"**
2. Set expiration (1 hour to 7 days)
3. Copy link to share

Perfect for:

- Sharing large files temporarily
- Giving access without AWS credentials
- Time-limited downloads

### Bucket Policies

View bucket permissions:

**<SCREENSHOT: Bucket policy viewer>**

Check who has access to your bucket and what permissions they have.

## Transfer Queue

**<SCREENSHOT: Transfer queue>**

All uploads/downloads appear in the transfer queue:

- **Pause** - Pause active transfers
- **Resume** - Resume paused transfers
- **Cancel** - Cancel transfers
- **Retry** - Retry failed transfers

Queued transfers use a queue-owned SFTP transport per host rather than a browser pane's connection. Closing that pane releases its connection without ending active queue transfers. Explicit disconnects and application shutdown still close their transports.

Unexpected transport loss settles affected attempts as failed with the real error and partial progress in history; it does not silently retry or leave them indefinitely active. Pause, resume and cancel preserve their existing behavior and transfer identities.

### Batch Operations

Select multiple files to:

- Upload/download in parallel
- Delete in batch
- Change permissions together

## Best Practices

✅ **DO:**

- Use SSH keys for SFTP (not passwords)
- Set proper file permissions (644 for files, 755 for dirs)
- Use S3 versioning for important data
- Check transfer queue for errors

❌ **DON'T:**

- Upload sensitive files to public S3 buckets
- Delete files without checking first
- Use root user for S3 (create IAM users)
- Skip permission checks on production servers

## Troubleshooting

### SFTP Connection Timeout

Check SSH connection first:

```bash
ssh user@server
```

Ensure SFTP subsystem is enabled in `/etc/ssh/sshd_config`:

```
Subsystem sftp /usr/lib/openssh/sftp-server
```

### S3 Access Denied

Verify IAM permissions include:

```json
{
  "Effect": "Allow",
  "Action": ["s3:ListBucket", "s3:GetObject", "s3:PutObject"],
  "Resource": ["arn:aws:s3:::your-bucket/*"]
}
```

For more help, see the [FAQ](/faq).
