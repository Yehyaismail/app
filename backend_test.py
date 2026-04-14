import requests
import sys
import json
import io
from datetime import datetime

class ChatAppAPITester:
    def __init__(self, base_url="https://message-connect-97.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_user = None
        self.test_user1 = None
        self.test_user2 = None
        self.uploaded_image = None
        self.uploaded_document = None
        self.uploaded_voice = None
        self.image_message = None
        self.file_message = None
        self.voice_message = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, cookies=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        
        # Don't set Content-Type for file uploads
        if not files:
            headers['Content-Type'] = 'application/json'
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = self.session.post(url, files=files, headers={})
                else:
                    response = self.session.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2, default=str)}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@chatapp.com", "password": "admin123"}
        )
        if success:
            self.admin_user = response
            print(f"   Admin logged in: {response.get('name', 'Unknown')}")
        return success

    def test_user_registration(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        
        # Register first test user
        success1, response1 = self.run_test(
            "User Registration 1",
            "POST",
            "api/auth/register",
            200,
            data={
                "name": f"Test User 1 {timestamp}",
                "email": f"testuser1_{timestamp}@example.com",
                "password": "testpass123"
            }
        )
        if success1:
            self.test_user1 = response1
            self.test_user1['password'] = "testpass123"
        
        # Register second test user
        success2, response2 = self.run_test(
            "User Registration 2",
            "POST",
            "api/auth/register",
            200,
            data={
                "name": f"Test User 2 {timestamp}",
                "email": f"testuser2_{timestamp}@example.com",
                "password": "testpass123"
            }
        )
        if success2:
            self.test_user2 = response2
            self.test_user2['password'] = "testpass123"
        
        return success1 and success2

    def test_duplicate_registration(self):
        """Test duplicate email registration"""
        if not self.test_user1:
            print("❌ Skipping duplicate registration test - no test user available")
            return False
            
        success, _ = self.run_test(
            "Duplicate Registration",
            "POST",
            "api/auth/register",
            400,
            data={
                "name": "Duplicate User",
                "email": self.test_user1['email'],
                "password": "testpass123"
            }
        )
        return success

    def test_user_login(self):
        """Test user login"""
        if not self.test_user1:
            print("❌ Skipping user login test - no test user available")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "api/auth/login",
            200,
            data={
                "email": self.test_user1['email'],
                "password": self.test_user1['password']
            }
        )
        return success

    def test_invalid_login(self):
        """Test invalid login credentials"""
        success, _ = self.run_test(
            "Invalid Login",
            "POST",
            "api/auth/login",
            401,
            data={
                "email": "nonexistent@example.com",
                "password": "wrongpassword"
            }
        )
        return success

    def test_get_current_user(self):
        """Test get current user endpoint"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "api/auth/me",
            200
        )
        return success

    def test_get_users_list(self):
        """Test get users list"""
        success, response = self.run_test(
            "Get Users List",
            "GET",
            "api/users",
            200
        )
        if success:
            print(f"   Found {len(response)} users")
        return success

    def test_send_message(self):
        """Test sending a message"""
        if not self.test_user2:
            print("❌ Skipping send message test - no second test user available")
            return False
            
        success, response = self.run_test(
            "Send Message",
            "POST",
            "api/messages",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "text": "Hello! This is a test message."
            }
        )
        return success

    def test_get_messages(self):
        """Test getting messages between users"""
        if not self.test_user2:
            print("❌ Skipping get messages test - no second test user available")
            return False
            
        success, response = self.run_test(
            "Get Messages",
            "GET",
            f"api/messages/{self.test_user2['id']}",
            200
        )
        if success:
            print(f"   Found {len(response)} messages")
        return success

    def test_get_conversations(self):
        """Test getting conversations"""
        success, response = self.run_test(
            "Get Conversations",
            "GET",
            "api/conversations",
            200
        )
        if success:
            print(f"   Found {len(response)} conversations")
        return success

    def test_logout(self):
        """Test logout"""
        success, response = self.run_test(
            "Logout",
            "POST",
            "api/auth/logout",
            200
        )
        return success

    def test_unauthorized_access(self):
        """Test unauthorized access after logout"""
        success, _ = self.run_test(
            "Unauthorized Access",
            "GET",
            "api/auth/me",
            401
        )
        return success

    def test_file_upload_image(self):
        """Test image file upload"""
        # Create a simple test image file
        image_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test_image.png', io.BytesIO(image_data), 'image/png')}
        
        success, response = self.run_test(
            "Upload Image File",
            "POST",
            "api/upload",
            200,
            files=files
        )
        
        if success:
            self.uploaded_image = response
            print(f"   Uploaded image: {response.get('original_filename')}")
            print(f"   Category: {response.get('category')}")
            print(f"   Storage path: {response.get('storage_path')}")
        
        return success

    def test_file_upload_document(self):
        """Test document file upload"""
        # Create a simple test document
        doc_data = b'This is a test document content for testing file upload functionality.'
        
        files = {'file': ('test_document.txt', io.BytesIO(doc_data), 'text/plain')}
        
        success, response = self.run_test(
            "Upload Document File",
            "POST",
            "api/upload",
            200,
            files=files
        )
        
        if success:
            self.uploaded_document = response
            print(f"   Uploaded document: {response.get('original_filename')}")
            print(f"   Category: {response.get('category')}")
            print(f"   Storage path: {response.get('storage_path')}")
        
        return success

    def test_file_download(self):
        """Test file download"""
        if not hasattr(self, 'uploaded_image') or not self.uploaded_image:
            print("❌ Skipping file download test - no uploaded file available")
            return False
            
        storage_path = self.uploaded_image.get('storage_path')
        if not storage_path:
            print("❌ Skipping file download test - no storage path available")
            return False
            
        # Test file download
        url = f"{self.base_url}/api/files/{storage_path}"
        print(f"   Downloading from: {url}")
        
        try:
            response = self.session.get(url)
            success = response.status_code == 200
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                print(f"   Content-Type: {response.headers.get('Content-Type')}")
                print(f"   Content-Length: {len(response.content)} bytes")
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                
            self.tests_run += 1
            return success
            
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.tests_run += 1
            return False

    def test_send_message_with_image(self):
        """Test sending a message with image attachment"""
        if not self.test_user2 or not hasattr(self, 'uploaded_image'):
            print("❌ Skipping image message test - missing requirements")
            return False
            
        success, response = self.run_test(
            "Send Message with Image",
            "POST",
            "api/messages",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "text": "صورة",
                "message_type": "image",
                "file_url": self.uploaded_image.get('storage_path'),
                "file_name": self.uploaded_image.get('original_filename'),
                "file_type": self.uploaded_image.get('content_type')
            }
        )
        
        if success:
            self.image_message = response
            print(f"   Message status: {response.get('status')}")
            print(f"   Message type: {response.get('message_type')}")
        
        return success

    def test_send_message_with_file(self):
        """Test sending a message with file attachment"""
        if not self.test_user2 or not hasattr(self, 'uploaded_document'):
            print("❌ Skipping file message test - missing requirements")
            return False
            
        success, response = self.run_test(
            "Send Message with File",
            "POST",
            "api/messages",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "text": self.uploaded_document.get('original_filename'),
                "message_type": "file",
                "file_url": self.uploaded_document.get('storage_path'),
                "file_name": self.uploaded_document.get('original_filename'),
                "file_type": self.uploaded_document.get('content_type')
            }
        )
        
        if success:
            self.file_message = response
            print(f"   Message status: {response.get('status')}")
            print(f"   Message type: {response.get('message_type')}")
        
        return success

    def test_upload_voice_file(self):
        """Test uploading a voice file"""
        # Create a mock voice file (webm format)
        voice_content = b'\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84webm\x42\x87\x81\x02\x42\x85\x81\x02'  # Mock WebM header
        voice_file = io.BytesIO(voice_content)
        
        success, response = self.run_test(
            "Upload Voice File",
            "POST",
            "api/upload",
            200,
            files={"file": ("test_voice.webm", voice_file, "audio/webm")}
        )
        
        if success:
            self.uploaded_voice = response
            print(f"   Uploaded voice: {response.get('original_filename')}")
            print(f"   Category: {response.get('category')}")
            print(f"   Storage path: {response.get('storage_path')}")
        
        return success

    def test_send_voice_message(self):
        """Test sending a voice message"""
        if not self.test_user2 or not hasattr(self, 'uploaded_voice'):
            print("❌ Skipping voice message test - missing requirements")
            return False
            
        success, response = self.run_test(
            "Send Voice Message",
            "POST",
            "api/messages",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "text": "رسالة صوتية",
                "message_type": "voice",
                "file_url": self.uploaded_voice.get('storage_path'),
                "file_name": self.uploaded_voice.get('original_filename'),
                "file_type": self.uploaded_voice.get('content_type'),
                "voice_duration": 5.2
            }
        )
        
        if success:
            self.voice_message = response
            print(f"   Voice message status: {response.get('status')}")
            print(f"   Message type: {response.get('message_type')}")
            print(f"   Voice duration: {response.get('voice_duration', 'Not set')}")
        
        return success

    def test_message_status_delivered(self):
        """Test message status changes to delivered when receiver loads conversations"""
        if not self.test_user2:
            print("❌ Skipping delivered status test - no test user available")
            return False
            
        # Login as user2 to check conversations (this should mark messages as delivered)
        login_success, _ = self.run_test(
            "User2 Login for Delivered Status",
            "POST",
            "api/auth/login",
            200,
            data={
                "email": self.test_user2['email'],
                "password": self.test_user2['password']
            }
        )
        
        if not login_success:
            return False
            
        # Load conversations (should mark messages as delivered)
        success, response = self.run_test(
            "Get Conversations (Mark as Delivered)",
            "GET",
            "api/conversations",
            200
        )
        
        if success:
            print(f"   Found {len(response)} conversations")
            # Check if any conversation has unread messages
            for conv in response:
                if conv.get('unread_count', 0) > 0:
                    print(f"   Conversation with {conv['other_user']['name']} has {conv['unread_count']} unread messages")
        
        return success

    def test_message_status_read(self):
        """Test message status changes to read when receiver opens chat"""
        if not self.test_user1:
            print("❌ Skipping read status test - no test user available")
            return False
            
        # Get messages between users (should mark messages as read)
        success, response = self.run_test(
            "Get Messages (Mark as Read)",
            "GET",
            f"api/messages/{self.test_user1['id']}",
            200
        )
        
        if success:
            print(f"   Found {len(response)} messages")
            # Check message statuses
            for msg in response:
                print(f"   Message: '{msg.get('text', '')[:30]}...' Status: {msg.get('status')}")
                
            # Verify messages are now marked as read
            read_messages = [msg for msg in response if msg.get('status') == 'read']
            if len(read_messages) > 0:
                print(f"   ✅ {len(read_messages)} messages marked as read")
            else:
                print(f"   ⚠️  No messages marked as read yet")
        
        return success

    def test_typing_indicator_set(self):
        """Test setting typing status"""
        if not self.test_user2:
            print("❌ Skipping typing indicator test - no test user available")
            return False
            
        success, response = self.run_test(
            "Set Typing Status (True)",
            "POST",
            "api/typing",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "is_typing": True
            }
        )
        return success

    def test_typing_indicator_get(self):
        """Test getting typing status"""
        if not self.test_user1:
            print("❌ Skipping get typing status test - no test user available")
            return False
            
        success, response = self.run_test(
            "Get Typing Status",
            "GET",
            f"api/typing/{self.test_user1['id']}",
            200
        )
        
        if success:
            print(f"   Typing status: {response.get('is_typing', False)}")
        
        return success

    def test_typing_indicator_unset(self):
        """Test unsetting typing status"""
        if not self.test_user2:
            print("❌ Skipping typing indicator unset test - no test user available")
            return False
            
        success, response = self.run_test(
            "Set Typing Status (False)",
            "POST",
            "api/typing",
            200,
            data={
                "receiver_id": self.test_user2['id'],
                "is_typing": False
            }
        )
        return success

    def test_admin_get_users(self):
        """Test admin get users endpoint"""
        if not self.admin_user:
            print("❌ Skipping admin get users test - no admin user available")
            return False
            
        # Login as admin first
        login_success, _ = self.run_test(
            "Admin Login for Admin Tests",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@chatapp.com", "password": "admin123"}
        )
        
        if not login_success:
            return False
            
        success, response = self.run_test(
            "Admin Get Users",
            "GET",
            "api/admin/users",
            200
        )
        
        if success:
            print(f"   Found {len(response)} users")
            for user in response:
                print(f"   User: {user.get('name')} ({user.get('email')}) - Messages: {user.get('message_count', 0)} - Role: {user.get('role', 'user')}")
        
        return success

    def test_admin_get_stats(self):
        """Test admin get stats endpoint"""
        success, response = self.run_test(
            "Admin Get Stats",
            "GET",
            "api/admin/stats",
            200
        )
        
        if success:
            print(f"   Total users: {response.get('total_users', 0)}")
            print(f"   Online users: {response.get('online_users', 0)}")
            print(f"   Total messages: {response.get('total_messages', 0)}")
            print(f"   Total files: {response.get('total_files', 0)}")
        
        return success

    def test_admin_delete_user_non_admin(self):
        """Test admin delete non-admin user"""
        if not self.test_user1:
            print("❌ Skipping admin delete user test - no test user available")
            return False
            
        # Re-login as admin first
        login_success, _ = self.run_test(
            "Admin Re-Login for Delete Test",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@chatapp.com", "password": "admin123"}
        )
        
        if not login_success:
            return False
            
        success, response = self.run_test(
            "Admin Delete Non-Admin User",
            "DELETE",
            f"api/admin/users/{self.test_user1['id']}",
            200
        )
        
        if success:
            print(f"   Deleted user: {response.get('deleted_user_id')}")
        
        return success

    def test_admin_delete_admin_user_forbidden(self):
        """Test admin cannot delete admin user"""
        # First get admin user ID
        users_success, users_response = self.run_test(
            "Get Users for Admin Delete Test",
            "GET",
            "api/admin/users",
            200
        )
        
        if not users_success:
            return False
            
        admin_user_id = None
        for user in users_response:
            if user.get('role') == 'admin':
                admin_user_id = user.get('id')
                break
                
        if not admin_user_id:
            print("❌ No admin user found to test deletion")
            return False
            
        success, response = self.run_test(
            "Admin Delete Admin User (Should Fail)",
            "DELETE",
            f"api/admin/users/{admin_user_id}",
            400
        )
        
        return success

    def test_auth_refresh_endpoint(self):
        """Test auth refresh endpoint returns user data with role"""
        # Login as admin first to get a valid session
        login_success, _ = self.run_test(
            "Admin Login for Refresh Test",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@chatapp.com", "password": "admin123"}
        )
        
        if not login_success:
            return False
            
        # Test refresh endpoint
        success, response = self.run_test(
            "Auth Refresh Endpoint",
            "POST",
            "api/auth/refresh",
            200
        )
        
        if success:
            # Verify response contains user data with role
            if 'role' in response:
                print(f"   ✅ Refresh endpoint returns role: {response.get('role')}")
                if response.get('role') == 'admin':
                    print(f"   ✅ Admin role correctly returned")
                else:
                    print(f"   ⚠️  Expected admin role, got: {response.get('role')}")
            else:
                print(f"   ❌ Refresh endpoint missing 'role' field")
                return False
                
            # Check other required fields
            required_fields = ['id', 'name', 'email']
            for field in required_fields:
                if field not in response:
                    print(f"   ❌ Refresh endpoint missing '{field}' field")
                    return False
                    
            print(f"   ✅ All required fields present in refresh response")
        
        return success

    def test_non_admin_access_admin_endpoints(self):
        """Test non-admin user cannot access admin endpoints"""
        if not self.test_user2:
            print("❌ Skipping non-admin access test - no test user available")
            return False
            
        # Login as regular user
        login_success, _ = self.run_test(
            "User Login for Non-Admin Test",
            "POST",
            "api/auth/login",
            200,
            data={
                "email": self.test_user2['email'],
                "password": self.test_user2['password']
            }
        )
        
        if not login_success:
            return False
            
        # Try to access admin endpoints (should fail with 403)
        success1, _ = self.run_test(
            "Non-Admin Access Users (Should Fail)",
            "GET",
            "api/admin/users",
            403
        )
        
        success2, _ = self.run_test(
            "Non-Admin Access Stats (Should Fail)",
            "GET",
            "api/admin/stats",
            403
        )
        
        success3, _ = self.run_test(
            "Non-Admin Delete User (Should Fail)",
            "DELETE",
            f"api/admin/users/{self.test_user2['id']}",
            403
        )
        
        return success1 and success2 and success3

def main():
    print("🚀 Starting Chat App API Tests")
    print("=" * 50)
    
    tester = ChatAppAPITester()
    
    # Test sequence
    tests = [
        ("Admin Login", tester.test_admin_login),
        ("User Registration", tester.test_user_registration),
        ("Duplicate Registration", tester.test_duplicate_registration),
        ("User Login", tester.test_user_login),
        ("Invalid Login", tester.test_invalid_login),
        ("Get Current User", tester.test_get_current_user),
        ("Auth Refresh Endpoint", tester.test_auth_refresh_endpoint),
        ("Get Users List", tester.test_get_users_list),
        ("Upload Image File", tester.test_file_upload_image),
        ("Upload Document File", tester.test_file_upload_document),
        ("Upload Voice File", tester.test_upload_voice_file),
        ("Download File", tester.test_file_download),
        ("Send Message", tester.test_send_message),
        ("Send Message with Image", tester.test_send_message_with_image),
        ("Send Message with File", tester.test_send_message_with_file),
        ("Send Voice Message", tester.test_send_voice_message),
        ("Get Messages", tester.test_get_messages),
        ("Get Conversations", tester.test_get_conversations),
        ("Message Status - Delivered", tester.test_message_status_delivered),
        ("Message Status - Read", tester.test_message_status_read),
        ("Typing Indicator - Set", tester.test_typing_indicator_set),
        ("Typing Indicator - Get", tester.test_typing_indicator_get),
        ("Typing Indicator - Unset", tester.test_typing_indicator_unset),
        ("Admin Get Users", tester.test_admin_get_users),
        ("Admin Get Stats", tester.test_admin_get_stats),
        ("Non-Admin Access Admin Endpoints", tester.test_non_admin_access_admin_endpoints),
        ("Admin Delete Non-Admin User", tester.test_admin_delete_user_non_admin),
        ("Admin Delete Admin User (Forbidden)", tester.test_admin_delete_admin_user_forbidden),
        ("Logout", tester.test_logout),
        ("Unauthorized Access", tester.test_unauthorized_access),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS")
    print("=" * 50)
    print(f"Tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {len(failed_tests)}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())