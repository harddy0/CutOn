import pathlib

# Fix lib/api/notifications.ts to re-export NotificationResponse
path = pathlib.Path(r'D:\Projects\cuton\apps\web\lib\api\notifications.ts')
content = path.read_text(encoding='utf-8')

# Check if there's already an export line for NotificationResponse
if 'export type { NotificationResponse }' not in content:
    # Add re-export at the end of the file
    content += '\nexport type { NotificationResponse } from "./dto";\n'
    path.write_text(content, encoding='utf-8')
    print('Added NotificationResponse re-export to notifications.ts')
else:
    print('NotificationResponse re-export already exists')

# Also verify the layout has the type import
path2 = pathlib.Path(r'D:\Projects\cuton\apps\web\app\dashboard\layout.tsx')
content2 = path2.read_text(encoding='utf-8')
if 'import type { NotificationResponse }' not in content2:
    # Add type import after the value import
    old = 'import { clearAccessToken, getMe, getUnreadNotificationCount, listNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/api";'
    new = old + '\nimport type { NotificationResponse } from "@/lib/api";'
    if old in content2:
        content2 = content2.replace(old, new)
        path2.write_text(content2, encoding='utf-8')
        print('Added NotificationResponse type import to layout.tsx')
    else:
        print('Could not find import line in layout.tsx')
else:
    print('NotificationResponse type import already in layout.tsx')
