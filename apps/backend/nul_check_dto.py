import pathlib

# Check DTO notifications
path = pathlib.Path(r'D:\Projects\cuton\apps\web\lib\api\dto\notifications.ts')
print('=== DTO notifications.ts ===')
print(path.read_text(encoding='utf-8'))

print()

# Check API notifications client
path2 = pathlib.Path(r'D:\Projects\cuton\apps\web\lib\api\notifications.ts')
print('=== API notifications.ts ===')
print(path2.read_text(encoding='utf-8'))

print()

# Check what the barrel index.ts exports for notifications
path3 = pathlib.Path(r'D:\Projects\cuton\apps\web\lib\api\index.ts')
content = path3.read_text(encoding='utf-8')
print('=== Barrel exports for notifications ===')
for line in content.split('\n'):
    if 'notif' in line.lower():
        print(line)
