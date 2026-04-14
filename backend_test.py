import requests
import sys
import json
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

    def run_test(self, name, method, endpoint, expected_status, data=None, cookies=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
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
        ("Get Users List", tester.test_get_users_list),
        ("Send Message", tester.test_send_message),
        ("Get Messages", tester.test_get_messages),
        ("Get Conversations", tester.test_get_conversations),
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