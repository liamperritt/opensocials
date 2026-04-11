import React, { useEffect, useRef, useState } from "react";
import { View, SafeAreaView, ActivityIndicator, StyleSheet, BackHandler, Text, Platform, Linking, TouchableOpacity, Image, Modal, Pressable, ScrollView } from "react-native";
import WebView from "react-native-webview";
import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';
import CONFIG from "./Config";

const Hyperlink = ({ url, children }: { url: string; children: React.ReactNode }) => (
  <Text style={styles.hyperlink} onPress={() => Linking.openURL(url)}>
    {children}
  </Text>
);

const APP_GRID = [
  {
    name: "Instagram",
    id: "instagram",
    icon: require("./assets/instagram.png"), // Add your icon images to assets/
    active: true,
  },
  {
    name: "Facebook",
    id: "facebook",
    icon: require("./assets/facebook.png"),
    active: true,
  },
  {
    name: "YouTube",
    id: "youtube",
    icon: require("./assets/youtube.png"),
    active: true,
  },
  {
    name: "X",
    id: "x",
    icon: require("./assets/app.png"),
    active: false,
  },
];
const GRID_ROWS = 2;
const GRID_COLS = 3;

const App = () => {
  const webViewRef = useRef<WebView>(null);
  const defaultWebAppId = "instagram"; // Default web app ID

  const [config, setConfig] = useState(CONFIG[defaultWebAppId]);
  const [injectedJavaScript, setInjectedJavaScript] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [showNotificationsInstructions, setShowNotificationsInstructions] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [wentBack, setWentBack] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);

  const fetchFiltersConfig = async (appId: string) => {
    console.log("Fetching filters config for app:", appId);
    const appConfig = CONFIG[appId];
    try {
      const response = await fetch(`${appConfig.configUrl}filters.json?cache_bust=true`);
      const data = await response.json();
      console.log("Filters config fetched:", data);
      return JSON.stringify(data);
    } catch (error) {
      console.error("Failed to fetch filters config:", error);
    }
    return JSON.stringify(appConfig.defaultFilters); // Fallback to default filters
  };

  const constructInjectedJavaScript = (filtersConfig: string) => {
    console.log("Constructing injected JavaScript with filters config:", filtersConfig);
    const newInjectedJavaScript = `
      // Function to hide elements based on filters config
      hideElements = () => {
        // List of elements to hide by class or CSS selector
        const elementsToHide = ${filtersConfig};
        // Hide each element by class or CSS selector
        elementsToHide.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              element.style.display = "none";
            });
          } catch (error) {} // Ignore errors
        });
      };

      // Function to mute elements based on config
      muteElements = () => {
        // List of elements to mute by class or CSS selector
        const elementsToMute = ["div[aria-label='YouTube Video Player'][class*='ad-showing'] > div > video"];
        // Mute each element by class or CSS selector
        elementsToMute.forEach(selector => {
          try {
            const element = document.querySelector(selector);
            if (element) {
              element.volume = 0; // Mute media elements
            }
          } catch (error) {} // Ignore errors
        });
      };

      // Function to unmute elements based on config
      unmuteElements = () => {
        // List of elements to unmute by class or CSS selector
        const elementsToUnmute = ["div[aria-label='YouTube Video Player']:not([class*='ad-showing']) > div > video"];
        // Unmute each element by class or CSS selector
        elementsToUnmute.forEach(selector => {
          try {
            const element = document.querySelector(selector);
            if (element) {
              element.volume = 1; // Restore volume for media elements
              element.muted = false; // Restore mute state for media elements
              element.style.display = ""; // Ensure the element is visible
            }
          } catch (error) {} // Ignore errors
        });
      };

      processSelectors = () => {
        hideElements();
        muteElements();
        unmuteElements();
      };

      // Event listener-based selector processing
      const observer = new MutationObserver(processSelectors);
      observer.observe(document.body, { childList: true, subtree: true });
      
      // Periodically run functions
      setInterval(() => {
        processSelectors();
      }, 100);
      true;
    `;
    if (newInjectedJavaScript !== injectedJavaScript) {
      console.log("Updating injected JavaScript:", newInjectedJavaScript);
      setInjectedJavaScript(newInjectedJavaScript);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(newInjectedJavaScript);
      }
    }
  };

  const updateConfig = async (appId: string) => {
    console.log("Updating config to app:", appId);
    const appConfig = CONFIG[appId];
    setConfig(appConfig);
    const filtersConfig = await fetchFiltersConfig(appId);
    constructInjectedJavaScript(filtersConfig);
  };

  const saveLoggedInWebAppId = async (appId: string) => {
    console.log("Saving logged in web app ID:", appId);
    try {
      await AsyncStorage.setItem("webAppId", appId);
      console.log("Web app ID saved successfully");
    } catch (error) {
      console.error("Failed to save web app ID:", error);
    }
  };

  const determineInitialWebAppId = async () => {
    console.log("Determining web app ID...");
    try {
      const appId = await AsyncStorage.getItem("webAppId");
      if (appId && CONFIG[appId]) {
        console.log("Web app ID found in AsyncStorage:", appId);
        updateConfig(appId);
      }
    } catch (error) {
      console.error("Failed to load web app ID from AsyncStorage:", error);
    }
  };

  const checkForLoggedInAppSession = async () => {
    try {
      // Construct list of app IDs, ensuring that webAppId is the first item and is not included in the list twice
      const appIds: string[] = [config.webAppId, ...Object.keys(CONFIG).filter(id => id !== config.webAppId)];
      console.log("Checking login state for app IDs:", appIds);
      for (const id of appIds) {
        const appConfig = CONFIG[id];
        const cookies = await CookieManager.get(appConfig.baseUrl, true);
        console.log("Checking login state with cookies");
        // Check if the required cookies are present
        const isLoggedIn = appConfig.webAppSessionCookies.every(cookieName => cookies[cookieName] && cookies[cookieName].value);
        console.log("Logging in state:", loggingIn);
        console.log("Logged in state:", isLoggedIn);
        // Update the home screen state based on login status
        if (isLoggedIn) {
          setLoggingIn(false);
          setLoggedIn(true);
          await saveLoggedInWebAppId(appConfig.webAppId);
          return;
        }
      }
    } catch (error) {
      console.error("Failed to check login state:", error);
    }
    setLoggedIn(false);
  };

  const loadInfoVisible = async () => {
    console.log("Loading infoVisible state from AsyncStorage...");
    try {
      const value = await AsyncStorage.getItem("infoVisible");
      if (value !== null) {
        console.log("infoVisible state loaded:", value);
        setInfoVisible(value === "true");
        return;
      }
    } catch (error) {
      console.error("Failed to load infoVisible state:", error);
    }
    // If no value is found, default to true
    console.log("No infoVisible state found, defaulting to true");
    setInfoVisible(true);
  };

  const saveInfoVisible = async (visible: boolean) => {
    try {
      await AsyncStorage.setItem("infoVisible", visible ? "true" : "false");
      setInfoVisible(visible);
    } catch (error) {
      console.error("Failed to save infoVisible state:", error);
    }
  };

  const trackNavState = (nativeEvent: any) => {
    console.log("Tracking navigation state:", nativeEvent);
    setCurrentUrl(nativeEvent.url);
    setCanGoBack(nativeEvent.canGoBack);
    if (wentBack) {
      setWentBack(false);
    }
  };

  const redirectToUrl = (url: string) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(`window.location.href = '${url}';`);
  };

  const redirectToSafety = (navState: any) => {
    console.log("Checking if we need to redirect to safety...");
    console.log("Current URL:", currentUrl);
    if (!webViewRef.current) return;
    // If we are logging in, redirect to the sign-in URL if it exists
    if (!loggedIn && loggingIn && config.signInUrl && (navState.url === config.sourceUrl || navState.url === config.baseUrl)) {
      console.log("Redirecting to sign-in URL:", config.signInUrl);
      redirectToUrl(config.signInUrl);
      return;
    }
    // Redirect from base Url, but avoid infinite loops
    if (
      (
        (navState.url === config.baseUrl || navState.url === `${config.baseUrl}/`) && config.redirectFromBaseUrl
        && !loggingIn && (currentUrl !== config.baseUrl && currentUrl !== `${config.baseUrl}/`)
      )
      || config.redirectFromExactUrls.includes(navState.url)
      || config.redirectFromUrlPrefixes.some(url => navState.url.startsWith(url))
    ) {
      // If we were on the source URL and are navigating to a forbidden URL
      if (config.fromSourceUrlRedirectToUrl && currentUrl === config.sourceUrl) {
        console.log("Redirecting to URL:", config.fromSourceUrlRedirectToUrl);
        redirectToUrl(config.fromSourceUrlRedirectToUrl);
        return;
      }
      // Otherwise, redirect to the source URL
      if (currentUrl !== config.sourceUrl && !wentBack) {
        console.log("Redirecting to URL:", config.sourceUrl);
        redirectToUrl(config.sourceUrl);
        return;
      }
    }

    if (config.redirectFromBaseUrlWithSelector && navState.url.endsWith(`${config.baseUrlShort}/`)) {
      const javaScript = `
        (function() {
          const redirectElement = document.querySelector("${config.redirectFromBaseUrlWithSelector}");
          if (redirectElement) {
            window.ReactNativeWebView.postMessage('redirect');
          }
        })();
        true;
      `;
      console.log("Injecting JavaScript to check for redirect selector:", javaScript);
      webViewRef.current.injectJavaScript(javaScript);
    }
  };

  const openLinkInWebView = (nativeEvent: any) => {
    if (!webViewRef.current) return; 
    if (nativeEvent.targetUrl.startsWith(config.baseUrl)) {
      // Prevent app links from opening in the device's default browser.
      // Instead, open the link in the WebView
      webViewRef.current.injectJavaScript(`window.location.href = '${nativeEvent.targetUrl}';`);
    }
  };

  const handleMessage = (nativeEvent: any) => {
    console.log("Received message from WebView:", nativeEvent.data);
    if (!webViewRef.current) return;
    if (nativeEvent.data === "redirect") {
      // If the redirect selector is detected, redirect to the source URL
      console.log("Redirecting due to selector detection");
      redirectToUrl(config.sourceUrl);
    }
  };

  const handleBackPress = () => {
    if (!webViewRef.current) return false;
    if (canGoBack) {
      webViewRef.current.goBack();
      setWentBack(true);
    } else {
      BackHandler.exitApp();
    }
    return true;
  };

  const handleLoadError = () => {
    setHasLoadError(true); // Set error state
    setTimeout(() => {
      if (webViewRef.current) {
        webViewRef.current.reload();
      } else {
        console.error("Failed to reload WebView");
      }
    }, 1000); // Retry after 1 second
  };

  const handleLoadSuccess = (nativeEvent: any) => {
    console.log("Handling load success:", nativeEvent);
    setHasLoadError(false);
  };

  const handleShouldStartLoadWithRequest = (request: any) => {
    if (!request.url.includes(config.baseUrlShort) && !config.openableExternalUrls.some(url => request.url.startsWith(url))) {
      console.log("External link detected, opening in default browser:", request.url);
      // Open external links in the device's default browser
      Linking.openURL(request.url);
      return false;
    }
    return true; // Allow the WebView to load the URL
  }

  const handleNavigationStateChange = (navState: any) => {
    console.log("Handling navigation state change:", navState);
    if (!webViewRef.current) return;
    // Check if we are logged in
    checkForLoggedInAppSession();

    // Redirect to the source URL if necessary
    redirectToSafety(navState);

    // Ensure currentUrl is set on navigation state change
    setCurrentUrl(navState.url);
  };

  const handleProcessTermination = () => {
    if (webViewRef.current) {
      console.log("Reloading on process termination...")
      webViewRef.current.reload();
    } else {
      console.error("Failed to reload")
    }
  };

  useEffect(() => {
    determineInitialWebAppId();
    loadInfoVisible();
  }, []); // Run once on component mount

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
    return () => backHandler.remove(); // Cleanup
  }, [canGoBack]); // Re-run the effect when canGoBack changes

  // Only mount WebView when not on home
  if (!loggedIn && !loggingIn) {
    // Fill grid with 4 icons and 5 empty spots
    const gridItems = [];
    let appIdx = 0;
    for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) {
      if (appIdx < APP_GRID.length) {
        const app = APP_GRID[appIdx];
        gridItems.push(
          <TouchableOpacity
            key={app.name}
            style={[
              styles.appIconContainer,
              !app.active && styles.appIconInactive,
            ]}
            activeOpacity={app.active ? 0.7 : 1}
            onPress={() => {
              if (app.active) {
                updateConfig(app.id);
                setLoggingIn(true);
              }
            }}
            disabled={!app.active}
          >
            <Image
              source={app.icon}
              style={[
                styles.appIcon,
                !app.active && styles.appIconImageInactive,
              ]}
              resizeMode="contain"
            />
            <Text
              style={[
                styles.appLabel,
                !app.active && styles.appLabelInactive,
              ]}
            >
              {app.name}
            </Text>
          </TouchableOpacity>
        );
        appIdx++;
      } else {
        // Empty grid spot
        gridItems.push(<View key={`empty-${i}`} style={styles.gridContainer} />);
      }
    }

    const notificationsInstructions = (
      <ScrollView contentContainerStyle={styles.notificationsContainer}>
        <Text style={styles.notificationsTitle}>Notifications</Text>
        <Text style={styles.notificationsText}>
          To ensure you get notifications from your social apps:
        </Text>
        {Platform.OS === "ios" ? (
          <Text style={styles.notificationsText}>
            1. Make sure to keep the official mobile app (e.g. Instagram) installed on your device with push notifications enabled for new messages or replies.{"\n\n"}
            2. Open the built-in <Hyperlink url="https://apps.apple.com/us/app/shortcuts/id915249334">Shortcuts</Hyperlink> iOS app on your device and navigate to the <Text style={{fontWeight: 'bold'}}>"Automation"</Text> section.{"\n\n"}
            3. Tap the + button to create a new <Text style={{fontWeight: 'bold'}}>"Personal Automation"</Text>.{"\n\n"}
            4. Select <Text style={{fontWeight: 'bold'}}>"App"</Text> as the trigger, then choose the official app (e.g. Instagram) and set it to trigger when the app <Text style={{fontWeight: 'bold'}}>"Is Opened"</Text>.{"\n\n"}
            5. Add an <Text style={{fontWeight: 'bold'}}>"Open App"</Text> action and select the <Text style={{fontWeight: 'bold'}}>OpenSocials</Text> app.{"\n\n"}
            6. Save the automation and ensure it is enabled.
          </Text>
        ) : (
          <Text style={styles.notificationsText}>
            1. Make sure to keep the official mobile app (e.g. Instagram) installed on your device with push notifications enabled for new messages or replies.{"\n\n"}
            2. On a Samsung device, open the built-in <Hyperlink url="https://galaxystore.samsung.com/prepost/000006561093">Modes and Routines</Hyperlink> app (or use a third-party automation app such as <Hyperlink url="https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm">Tasker</Hyperlink> instead).{"\n\n"}
            3. Navigate to the <Text style={{fontWeight: 'bold'}}>"Routines"</Text> section and tap the + button to create a new routine.{"\n\n"}
            4. Select <Text style={{fontWeight: 'bold'}}>"App opened"</Text> as the "If" condition and choose the official app (e.g. Instagram).{"\n\n"}
            5. Select <Text style={{fontWeight: 'bold'}}>"Apps &gt; Open an app or do an app action"</Text> as the "Then" action and select the <Text style={{fontWeight: 'bold'}}>OpenSocials</Text> app.{"\n\n"}
            6. Save the routine and ensure it is enabled.
          </Text>
        )}
        <Text style={styles.notificationsText}>
          Now, whenever you receive a push notification from the official app, opening it will automatically redirect to OpenSocials instead!{"\n"}
        </Text>
        <Pressable
          style={styles.infoCloseButton}
          onPress={() => setShowNotificationsInstructions(false)}
          accessibilityLabel="Close notifications instructions"
        >
          <Text style={styles.infoCloseButtonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>OpenSocials</Text>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setDropdownVisible((v) => !v)}
            accessibilityLabel="Open settings menu"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {/* Kebab menu icon (three horizontal dots) */}
            <View style={styles.kebabMenu}>
              <View style={styles.kebabDot} />
              <View style={styles.kebabDot} />
              <View style={styles.kebabDot} />
            </View>
          </TouchableOpacity>
          {/* Dropdown menu */}
          {dropdownVisible && (
            <View style={styles.dropdownMenu}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setDropdownVisible(false);
                  setShowNotificationsInstructions(true);
                }}
              >
                <Text style={styles.dropdownItemText}>Notifications</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.gridContainer}>
          {gridItems}
        </View>
        <Modal
          visible={infoVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.infoModalOverlay}>
            <View style={styles.infoModal}>
              <Text style={styles.infoTitle}>Welcome!</Text>
              <Text style={styles.infoText}>
                Welcome to OpenSocials, the open web app browser that puts you back in control of your social media usage,
                keeping you connected without all the distractions and time-wasting scolling.{"\n\n"}
                Tap a social web app to sign in. You can return to this home page at any time by signing out again.
                For advanced features like app notifications, tap the ⋮ icon in the top right corner.
              </Text>
              <Pressable
                style={styles.infoCloseButton}
                onPress={() => saveInfoVisible(false)}
                accessibilityLabel="Close info popup"
              >
                <Text style={styles.infoCloseButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          visible={showNotificationsInstructions}
          transparent
          animationType="slide"
          onRequestClose={() => setShowNotificationsInstructions(false)}
        >
          <SafeAreaView style={styles.infoModalOverlay}>
            <View style={styles.infoModal}>
              {notificationsInstructions}
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView style={styles.container}
        ref={webViewRef}
        source={{ uri: config.sourceUrl }}
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        javaScriptCanOpenWindowsAutomatically={true}
        onMessage={(syntheticEvent) => {handleMessage(syntheticEvent.nativeEvent)}}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => <View />}
        onError={() => {handleLoadError()}}
        onLoad={(syntheticEvent) => {handleLoadSuccess(syntheticEvent.nativeEvent)}}
        onLoadStart={(syntheticEvent) => {trackNavState(syntheticEvent.nativeEvent)}}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={handleNavigationStateChange}
        onOpenWindow={(syntheticEvent) => {openLinkInWebView(syntheticEvent.nativeEvent)}}
        onContentProcessDidTerminate={handleProcessTermination}
        onRenderProcessGone={handleProcessTermination}
        allowsBackForwardNavigationGestures={true}
        pullToRefreshEnabled={true}
        mediaPlaybackRequiresUserAction={true}
        allowsInlineMediaPlayback={true}
        allowsPictureInPictureMediaPlayback={true}
        allowsFullscreenVideo={true}
        contentMode={"mobile"}
      />
      {hasLoadError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Unable to load page</Text>
          <Text style={styles.errorSubtitle}>Please check your internet connection.</Text>
          <ActivityIndicator size="large" color="white"/>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  titleBar: {
    height: 56,
    backgroundColor: '#181818',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderBottomColor: '#222',
    borderBottomWidth: 1,
  },
  titleText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    paddingLeft: 16,
    paddingRight: 56, // Space for back button
  },
  backButton: {
    position: 'absolute',
    left: 0,
    height: '100%',
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  backButtonText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '400',
  },
  gridContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  appIconContainer: {
    width: '30%',
    aspectRatio: 1,
    margin: '1.66%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#232323',
  },
  appIcon: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  appLabel: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  appIconInactive: {
    opacity: 0.4,
  },
  appIconImageInactive: {
    tintColor: '#888',
  },
  appLabelInactive: {
    color: '#888',
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoModal: {
    backgroundColor: '#232323',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    alignItems: 'center',
    maxWidth: 340,
  },
  infoTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  infoText: {
    color: '#ccc',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  infoCloseButton: {
    backgroundColor: '#444',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  infoCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  menuButton: {
    position: 'absolute',
    right: 8,
    top: 0,
    height: 56,
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  kebabMenu: {
    height: 14,
    width: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
  },
  kebabDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#aaa',
    marginVertical: 1.5,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 56,
    right: 12,
    backgroundColor: '#232323',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 20,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  notificationsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    minWidth: 260,
  },
  notificationsTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  notificationsText: {
    color: '#ccc',
    fontSize: 15,
    textAlign: 'left',
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  hyperlink: {
    color: '#4da3ff',
  },
  webview: {
    flex: 1,
    backgroundColor: 'black',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  errorTitle: {
    color: 'white',
    fontSize: 20,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 5,
  },
  errorSubtitle: {
    color: 'gray',
    fontSize: 15,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
  },
});

export default App;
