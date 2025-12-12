/*
 * Arduino Button Logger - Fixed Pin Definitions
 * 
 * This sketch logs button press/release timestamps with proper pin definitions.
 * Works with most Arduino boards (Uno, Nano, Mega, etc.)
 */

// Pin definitions - use numbers instead of D2
const int BUTTON_PIN = 2;        // Digital pin 2 (not D2)
const int LED_PIN = 13;          // Built-in LED pin
const int DEBOUNCE_DELAY = 50;   // Debounce delay in milliseconds

// Button state tracking
bool lastButtonState = HIGH;     // Previous button state
bool currentButtonState = HIGH;  // Current button state
unsigned long lastDebounceTime = 0;  // Last time button state changed
unsigned long lastHeartbeat = 0;     // For heartbeat LED

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  
  // Wait for serial port to connect (important for some boards)
  while (!Serial) {
    delay(10);
  }
  
  // Configure pins
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // Button with internal pull-up
  pinMode(LED_PIN, OUTPUT);           // LED for visual feedback
  
  // Send startup messages
  Serial.println("=== ARDUINO BUTTON LOGGER ===");
  Serial.println("Button connected to pin 2");
  Serial.println("Press and release button to see timestamps");
  Serial.print("Initial button state: ");
  Serial.println(digitalRead(BUTTON_PIN) ? "HIGH (not pressed)" : "LOW (pressed)");
  Serial.println("=============================");
  
  // Blink LED to show startup
  for(int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

void loop() {
  // Heartbeat LED - blinks every 2 seconds
  if (millis() - lastHeartbeat > 2000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastHeartbeat = millis();
  }
  
  // Read the current state of the button
  int reading = digitalRead(BUTTON_PIN);
  
  // Check if button state has changed (for debouncing)
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }
  
  // If enough time has passed since last state change, consider it a valid press
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
    // If button state has actually changed
    if (reading != currentButtonState) {
      currentButtonState = reading;
      
      // Button was just pressed (HIGH to LOW transition)
      if (currentButtonState == LOW) {
        unsigned long timestamp = millis();
        Serial.print("Button PRESSED at: ");
        Serial.print(timestamp);
        Serial.print(" ms (");
        Serial.print(timestamp / 1000.0, 3);
        Serial.println(" seconds)");
        
        // Flash LED to confirm button press
        digitalWrite(LED_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
      }
      // Button was just released (LOW to HIGH transition)
      else if (currentButtonState == HIGH) {
        unsigned long timestamp = millis();
        Serial.print("Button RELEASED at: ");
        Serial.print(timestamp);
        Serial.print(" ms (");
        Serial.print(timestamp / 1000.0, 3);
        Serial.println(" seconds)");
        
        // Flash LED to confirm button release
        digitalWrite(LED_PIN, HIGH);
        delay(50);
        digitalWrite(LED_PIN, LOW);
      }
    }
  }
  
  // Save the current reading for next iteration
  lastButtonState = reading;
  
  // Small delay to prevent overwhelming the serial port
  delay(10);
}
