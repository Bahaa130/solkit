package app.solkit.mobile;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(WalletLauncherPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
