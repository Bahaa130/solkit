package app.solkit.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;

import android.content.Intent;
import android.net.Uri;
import android.content.ActivityNotFoundException;

@CapacitorPlugin(name = "WalletLauncher")
public class WalletLauncherPlugin extends Plugin {
  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    String packageName = call.getString("packageName");
    if (url == null || url.isEmpty()) {
      call.reject("url_required");
      return;
    }
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setData(Uri.parse(url));
      intent.addCategory(Intent.CATEGORY_BROWSABLE);
      intent.addCategory(Intent.CATEGORY_DEFAULT);
      // للروابط الموحّدة http(s): نترك Android يحلّها عبر app-link (يفتح Phantom مباشرة).
      // للمخططات المخصصة فقط: نثبّت الحزمة لتفادي أي تطبيق آخر.
      if (packageName != null && !packageName.isEmpty() && !url.startsWith("http")) {
        intent.setPackage(packageName);
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
      getActivity().startActivity(intent);
      JSObject ret = new JSObject();
      ret.put("success", true);
      call.resolve(ret);
    } catch (ActivityNotFoundException e) {
      call.reject("activity_not_found");
    } catch (Exception e) {
      call.reject("error:" + e.getMessage());
    }
  }
}
